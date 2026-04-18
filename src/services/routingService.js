import * as turf from '@turf/turf';
import { getAdjustedThresholds } from '../data/vehicles';

// Mapbox access token (same as FloodMap)
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';

// Buffer radius around flood points (in kilometers)
const FLOOD_BUFFER_RADIUS = 0.08; // 80 meters — tight around the sensor; avoids flagging nearby parallel roads
export const RAIN_PRECAUTION_THRESHOLD = 25; // mm — moderate rainfall (25mm), road ponding likely
const PRECAUTIONARY_BUFFER_RADIUS = 0.06; // 60m — smaller buffer for pre-emptive caution

// ── Historical flood zone cache ─────────────────────────────────────────
let historicalGeoJSONCache = null;

/**
 * Load UP NOAH historical flood GeoJSON (Batangas 5-year).
 * Fetches once and caches in memory — the file is ~26 MB so we avoid
 * re-fetching on every route calculation.
 * @returns {Promise<Object|null>} GeoJSON FeatureCollection or null on error
 */
export async function loadHistoricalFloodZones() {
    if (historicalGeoJSONCache) return historicalGeoJSONCache;

    try {
        const res = await fetch('/data/batangas_flood_5yr.geojson');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geojson = await res.json();
        historicalGeoJSONCache = geojson;
        return geojson;
    } catch (err) {
        console.error('Failed to load historical flood zones:', err);
        return null;
    }
}

/**
 * Merge historical flood polygons into the sensor-derived flood zones.
 * Each historical feature gets `status: "historical"` so the scoring
 * engine can apply a soft penalty.
 *
 * @param {Object} sensorFloodZones - FeatureCollection from createFloodZones()
 * @param {Object} historicalGeoJSON - FeatureCollection from loadHistoricalFloodZones()
 * @returns {Object} Merged GeoJSON FeatureCollection
 */
export function mergeHistoricalZones(sensorFloodZones, historicalGeoJSON) {
    if (!historicalGeoJSON || !historicalGeoJSON.features) return sensorFloodZones;

    const taggedHistorical = historicalGeoJSON.features.map((feature) => ({
        ...feature,
        properties: {
            ...feature.properties,
            status: 'historical',
            name: feature.properties?.name || 'Historical Flood Zone',
        },
    }));

    return turf.featureCollection([
        ...(sensorFloodZones?.features || []),
        ...taggedHistorical,
    ]);
}

// Lipa City bounding box for geocoding bias
const LIPA_BBOX = [121.05, 13.85, 121.25, 14.05];

/**
 * Search for locations using Mapbox Geocoding API, with a fallback to OpenStreetMap
 * Includes POIs, landmarks, addresses, streets, neighborhoods, and places
 * @param {string} query - Search text
 * @returns {Promise<Array>} Array of location results
 */
export async function searchLocations(query) {
    if (!query || query.length < 2) return [];

    let results = [];

    // 1. Try Mapbox First
    try {
        const types = 'poi,address,neighborhood,locality,place,region';
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&bbox=${LIPA_BBOX.join(',')}&limit=5&types=${types}&language=en,tl`;
        
        const response = await fetch(mapboxUrl);
        if (response.ok) {
            const data = await response.json();
            results = data.features.map(f => {
                let category = 'place';
                if (f.place_type.includes('poi')) category = 'landmark';
                else if (f.place_type.includes('address')) category = 'address';
                else if (f.place_type.includes('neighborhood')) category = 'neighborhood';
                else if (f.place_type.includes('locality') || f.place_type.includes('place')) category = 'city';

                return {
                    id: f.id,
                    name: f.text,
                    address: f.place_name,
                    coordinates: f.center, // [longitude, latitude]
                    category,
                    source: 'mapbox'
                };
            });
        }
    } catch (error) {
        console.error('Mapbox geocoding error:', error);
    }

    // 2. Fallback / Supplement with OpenStreetMap (Nominatim) for better local landmarks
    // We fetch this if Mapbox returns very few results, or just to supplement POIs
    try {
        // Bounding box for Nominatim is: left,top,right,bottom
        // LIPA_BBOX mapbox format: minLon, minLat, maxLon, maxLat
        const viewbox = `${LIPA_BBOX[0]},${LIPA_BBOX[3]},${LIPA_BBOX[2]},${LIPA_BBOX[1]}`;
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1&addressdetails=1`;
        
        const osmResponse = await fetch(osmUrl, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9,tl;q=0.8',
                // Nominatim requires a user agent
                'User-Agent': 'SanBahaApp/1.0'
            }
        });

        if (osmResponse.ok) {
            const osmData = await osmResponse.json();
            
            const osmResults = osmData.map(item => {
                // Determine category based on OSM tags
                let category = 'place';
                if (item.type === 'yes' || item.class === 'amenity' || item.class === 'shop' || item.class === 'tourism' || item.class === 'historic') category = 'landmark';
                else if (item.class === 'highway' || item.class === 'building') category = 'address';
                else if (item.type === 'residential' || item.type === 'suburb') category = 'neighborhood';
                
                // Format a clean address
                const addr = item.address;
                const name = item.name || (addr && (addr.amenity || addr.shop || addr.road)) || 'Unknown Location';
                const formattedAddress = [
                    addr.road, addr.suburb, addr.city || addr.town, addr.state
                ].filter(Boolean).join(', ');

                return {
                    id: `osm-${item.place_id}`,
                    name: name,
                    address: formattedAddress || item.display_name,
                    // OSM returns string coords, we need numbers in [lon, lat] format
                    coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
                    category,
                    source: 'osm'
                };
            });

            // Merge results, removing duplicates (basic name check)
            const mapboxNames = new Set(results.map(r => r.name.toLowerCase()));
            for (const osmLoc of osmResults) {
                if (!mapboxNames.has(osmLoc.name.toLowerCase())) {
                    results.push(osmLoc);
                }
            }
        }
    } catch (error) {
        console.error('OSM geocoding error:', error);
    }

    return results.slice(0, 8); // Return top 8 combined results
}

/**
 * Reverse geocode coordinates to address
 * @param {Array} coords - [longitude, latitude]
 * @returns {Promise<Object>} Location details
 */
export async function reverseGeocode(coords) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Reverse geocoding failed');
        const data = await response.json();

        if (data.features.length > 0) {
            const f = data.features[0];
            return {
                name: f.text,
                address: f.place_name,
                coordinates: coords,
            };
        }
        return { name: 'Current Location', address: 'Your location', coordinates: coords };
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return { name: 'Current Location', address: 'Your location', coordinates: coords };
    }
}

/**
 * Get directions from Mapbox API
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {boolean} alternatives - Request alternative routes
 * @param {Array} [waypoints=[]] - Optional intermediate waypoints as [[lon, lat], ...]
 * @returns {Promise<Object>} Route data
 */
export async function getDirections(origin, destination, alternatives = true, waypoints = []) {
    const allCoords = [origin, ...waypoints, destination];
    const coords = allCoords.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching directions:', error);
        throw error;
    }
}

/**
 * Create circular buffer polygons around flood points.
 * When `vehicle` is provided, uses vehicle-adjusted thresholds to classify
 * sensor status. Without `vehicle`, falls back to the global fixed thresholds.
 *
 * @param {Array} floodPoints - Array of flood hotspot objects with { status, waterLevel, rain_mm, coordinates }
 * @param {Object|null} [vehicle=null] - Vehicle profile from PRESET_VEHICLES
 * @returns {Object} GeoJSON FeatureCollection of flood zones
 */
export function createFloodZones(floodPoints, vehicle = null) {
    const getEffectiveStatus = (point) => {
        if (!vehicle) return point.status;
        const { passableMax, warningMax } = getAdjustedThresholds(vehicle);
        const wl = point.waterLevel ?? 0;
        if (wl < passableMax) return 'clear';
        if (wl < warningMax) return 'warning';
        return 'flooded';
    };

    const relevantPoints = floodPoints.filter(p => {
        const effectiveStatus = getEffectiveStatus(p);
        return (
            effectiveStatus === 'flooded' ||
            effectiveStatus === 'warning' ||
            (effectiveStatus === 'clear' && (p.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
        );
    });

    const features = relevantPoints.map(point => {
        const effectiveStatus = getEffectiveStatus(point);
        const zoneStatus = (effectiveStatus === 'clear' && (point.rain_mm ?? 0) >= RAIN_PRECAUTION_THRESHOLD)
            ? 'precautionary'
            : effectiveStatus;

        const radius = zoneStatus === 'precautionary' ? PRECAUTIONARY_BUFFER_RADIUS : FLOOD_BUFFER_RADIUS;
        const center = turf.point([point.coordinates[1], point.coordinates[0]]);
        const buffer = turf.buffer(center, radius, { units: 'kilometers' });
        buffer.properties = {
            id: point.id,
            name: point.name,
            status: zoneStatus,
            waterLevel: point.waterLevel,
            rain_mm: point.rain_mm ?? 0,
        };
        return buffer;
    });

    return turf.featureCollection(features);
}

/**
 * Check if a route intersects with any flood zones
 * @param {Object} route - GeoJSON LineString of the route
 * @param {Object} floodZones - GeoJSON FeatureCollection of flood zone polygons
 * @returns {Object} { intersects: boolean, intersectedZones: Array }
 */
export function checkRouteIntersection(route, floodZones) {
    const intersectedZones = [];
    const routeLine = turf.lineString(route.geometry.coordinates);

    for (const zone of floodZones.features) {
        // booleanIntersects accurately checks if the route crosses, is inside, or touches the flood polygon
        if (turf.booleanIntersects(routeLine, zone)) {
            intersectedZones.push(zone.properties);
        }
    }

    return {
        intersects: intersectedZones.length > 0,
        intersectedZones
    };
}

const BYPASS_DISTANCE_KM = 0.22; // ~220m — close enough to stay near parallel roads

/**
 * Compute a single midpoint bypass waypoint per hard flood zone.
 * Uses the midpoint of the flooded segment offset perpendicularly, which
 * keeps the waypoint close to roads that run parallel to the flooded stretch.
 * Only operates on hard flood zones (flooded/warning) — precautionary and
 * historical zones are skipped here and handled as warnings only.
 *
 * @param {Object} safeRoute - route object with .geometry (raw GeoJSON LineString geometry)
 * @param {Object} floodZones - GeoJSON FeatureCollection of flood zone polygons
 * @returns {Array} Array of [lon, lat] waypoint coordinates in route-progress order
 */
export function computeBypassWaypoints(safeRoute, floodZones) {
    if (!floodZones.features.length) return [];

    const routeLine = turf.lineString(safeRoute.geometry.coordinates);
    const waypointsWithPos = [];

    const hardZones = floodZones.features.filter(
        z => z.properties.status !== 'precautionary' && z.properties.status !== 'historical'
    );

    for (const zone of hardZones) {
        if (!turf.booleanIntersects(routeLine, zone)) continue;

        const intersections = turf.lineIntersect(routeLine, zone);
        const floodCenter = turf.centroid(zone);
        const nearestPt = turf.nearestPointOnLine(routeLine, floodCenter);

        let midCoords;
        let midPos;

        if (intersections.features.length >= 2) {
            const ordered = intersections.features
                .map(f => ({
                    coords: f.geometry.coordinates,
                    location: turf.nearestPointOnLine(routeLine, f).properties.location,
                }))
                .sort((a, b) => a.location - b.location);

            const entry = ordered[0];
            const exit = ordered[ordered.length - 1];
            midCoords = [
                (entry.coords[0] + exit.coords[0]) / 2,
                (entry.coords[1] + exit.coords[1]) / 2,
            ];
            midPos = (entry.location + exit.location) / 2;
        } else {
            midCoords = floodCenter.geometry.coordinates;
            midPos = nearestPt.properties.location;
        }

        const bearing = turf.bearing(turf.point(midCoords), nearestPt);
        const rightPerp = (bearing + 90 + 360) % 360;
        const leftPerp  = (bearing - 90 + 360) % 360;

        let candidate = turf.destination(turf.point(midCoords), BYPASS_DISTANCE_KM, rightPerp, { units: 'kilometers' });
        if (floodZones.features.some(z => turf.booleanPointInPolygon(candidate, z))) {
            candidate = turf.destination(turf.point(midCoords), BYPASS_DISTANCE_KM, leftPerp, { units: 'kilometers' });
        }

        waypointsWithPos.push({ coords: candidate.geometry.coordinates, position: midPos });
    }

    waypointsWithPos.sort((a, b) => a.position - b.position);
    return waypointsWithPos.map(w => w.coords);
}

/**
 * Find the shortest dry path from alternatives.
 * Priority: 1. Avoid flooded/warning areas  2. Avoid precautionary areas  3. Shortest duration
 * @param {Array} routes - Array of route objects from Mapbox
 * @param {Object} floodZones - GeoJSON flood zones (may include precautionary zones)
 * @returns {Object} { safeRoute, allRoutes, hasSafeRoute, warnings, precautionaryWarnings }
 */
export function findSafestRoute(routes, floodZones) {
    const analyzedRoutes = routes.map((route, index) => {
        const routeGeoJSON = {
            type: 'Feature',
            geometry: route.geometry
        };

        const intersection = checkRouteIntersection(routeGeoJSON, floodZones);

        let floodPenalty = 0;
        if (intersection.intersects) {
            // Classify intersected zones by severity
            const hasHardFlood = intersection.intersectedZones.some(
                z => z.status !== 'precautionary' && z.status !== 'historical'
            );
            const hasPrecautionary = intersection.intersectedZones.some(z => z.status === 'precautionary');
            const hasHistorical = intersection.intersectedZones.some(z => z.status === 'historical');

            if (hasHardFlood) {
                // Flooded / warning sensor — hard penalty
                floodPenalty = 1000000 + (intersection.intersectedZones.length * 10000);
            } else if (hasPrecautionary) {
                // Sensor with heavy rain — moderate penalty
                floodPenalty = 500000;
            } else if (hasHistorical) {
                // Historical flood zone during active rain — soft penalty
                floodPenalty = 250000;
            }
        }

        return {
            index,
            route,
            geometry: route.geometry,
            duration: route.duration,
            distance: route.distance,
            isFlooded: intersection.intersects && intersection.intersectedZones.some(
                z => z.status !== 'precautionary' && z.status !== 'historical'
            ),
            floodedZones: intersection.intersectedZones,
            score: floodPenalty + route.duration
        };
    });

    analyzedRoutes.sort((a, b) => a.score - b.score);

    const safeRoutes = analyzedRoutes.filter(r => !r.isFlooded);
    const safeRoute = analyzedRoutes[0];

    const precautionaryWarnings = safeRoute.isFlooded
        ? []
        : safeRoute.floodedZones.filter(z => z.status === 'precautionary');

    return {
        safeRoute,
        allRoutes: analyzedRoutes,
        hasSafeRoute: safeRoutes.length > 0,
        warnings: safeRoute.isFlooded ? safeRoute.floodedZones.filter(z => z.status !== 'precautionary' && z.status !== 'historical') : [],
        precautionaryWarnings,
        historicalWarnings: safeRoute.floodedZones.filter(z => z.status === 'historical'),
    };
}

/**
 * Format duration in minutes/hours
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
    if (seconds < 60) return '< 1 min';
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

/**
 * Format distance in km
 * @param {number} meters
 * @returns {string}
 */
export function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Get route with flood avoidance
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Array} floodPoints - Array of flood hotspot objects
 * @param {Object|null} [vehicle=null] - Vehicle profile from PRESET_VEHICLES
 * @returns {Promise<Object>} Analyzed route data
 */
export async function getSmartRoute(origin, destination, floodPoints, vehicle = null) {
    try {
        const directionsData = await getDirections(origin, destination, true);

        if (!directionsData.routes || directionsData.routes.length === 0) {
            throw new Error('No routes found');
        }

        const floodZones = createFloodZones(floodPoints, vehicle);   // ← pass vehicle
        const analysis = findSafestRoute(directionsData.routes, floodZones);

        return {
            success: true,
            ...analysis,
            floodZones,
            origin,
            destination
        };
    } catch (error) {
        console.error('Smart routing error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get route with active flood zone avoidance via waypoint injection.
 * On first call, behaves identically to getSmartRoute. If the best route
 * is flooded, computes bypass waypoints and retries once.
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Array} floodPoints - Array of flood hotspot objects
 * @param {Object|null} [vehicle=null] - Vehicle profile from PRESET_VEHICLES
 * @returns {Promise<Object>} { success, safeRoute, allRoutes, floodZones, warnings, unavoidable, origin, destination }
 */
export async function getSmartRouteWithAvoidance(origin, destination, floodPoints, vehicle = null) {
    try {
        const initial = await getSmartRoute(origin, destination, floodPoints, vehicle);
        if (!initial.success) return initial;
        // findSafestRoute already picks the best non-flooded Mapbox alternative when one exists.
        // If the best route is still flooded, all alternatives go through flood zones — report unavoidable.
        return { ...initial, unavoidable: initial.safeRoute.isFlooded };
    } catch (error) {
        console.error('Smart routing with avoidance error:', error);
        return { success: false, error: error.message };
    }
}
