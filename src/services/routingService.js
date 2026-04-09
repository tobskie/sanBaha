import * as turf from '@turf/turf';

// Mapbox access token (same as FloodMap)
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';

// Buffer radius around flood points (in kilometers)
const FLOOD_BUFFER_RADIUS = 0.15; // 150 meters

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
    const coords = [origin, ...waypoints, destination].map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

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
 * Create circular buffer polygons around flood points
 * @param {Array} floodPoints - Array of flood hotspot objects
 * @returns {Object} GeoJSON FeatureCollection of flood zones
 */
export function createFloodZones(floodPoints) {
    const floodedPoints = floodPoints.filter(p => p.status === 'flooded' || p.status === 'warning');

    const features = floodedPoints.map(point => {
        const center = turf.point([point.coordinates[1], point.coordinates[0]]);
        const buffer = turf.buffer(center, FLOOD_BUFFER_RADIUS, { units: 'kilometers' });
        buffer.properties = {
            id: point.id,
            name: point.name,
            status: point.status,
            waterLevel: point.waterLevel
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

const BYPASS_DISTANCE_KM = 0.3; // 2× FLOOD_BUFFER_RADIUS

/**
 * Compute bypass waypoints that steer around intersected flood zones.
 * For each crossed zone, places a waypoint 300m perpendicular from the
 * flood center. Tries right side first; falls back to left side if that
 * candidate itself sits inside a flood zone.
 * @param {Object} safeRoute - route object with .geometry (GeoJSON LineString)
 * @param {Object} floodZones - GeoJSON FeatureCollection of flood zone polygons
 * @returns {Array} Array of [lon, lat] waypoint coordinates
 */
export function computeBypassWaypoints(safeRoute, floodZones) {
    if (!floodZones.features.length) return [];

    const routeLine = turf.lineString(safeRoute.geometry.coordinates);
    const waypoints = [];

    for (const zone of floodZones.features) {
        if (!turf.booleanIntersects(routeLine, zone)) continue;

        const floodCenter = turf.centroid(zone);
        const nearestPt = turf.nearestPointOnLine(routeLine, floodCenter);
        const bearing = turf.bearing(floodCenter, nearestPt);

        // Try right-perpendicular first
        const rightBearing = (bearing + 90 + 360) % 360;
        let candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, rightBearing, { units: 'kilometers' });

        // If right candidate is inside any flood zone, try left
        const candidateInFlood = floodZones.features.some(z =>
            turf.booleanPointInPolygon(candidate, z)
        );
        if (candidateInFlood) {
            const leftBearing = (bearing - 90 + 360) % 360;
            candidate = turf.destination(floodCenter, BYPASS_DISTANCE_KM, leftBearing, { units: 'kilometers' });
        }

        waypoints.push(candidate.geometry.coordinates);
    }

    return waypoints;
}

/**
 * Find the shortest dry path from alternatives
 * Priority: 1. Avoid flooded areas  2. Shortest distance
 * @param {Array} routes - Array of route objects from Mapbox
 * @param {Object} floodZones - GeoJSON flood zones
 * @returns {Object} { safeRoute, allRoutes, warnings }
 */
export function findSafestRoute(routes, floodZones) {
    const analyzedRoutes = routes.map((route, index) => {
        const routeGeoJSON = {
            type: 'Feature',
            geometry: route.geometry
        };

        const intersection = checkRouteIntersection(routeGeoJSON, floodZones);
        const floodPenalty = intersection.intersects
            ? 1000000 + (intersection.intersectedZones.length * 10000) // Heavy penalty for flooded routes
            : 0;

        return {
            index,
            route,
            geometry: route.geometry,
            duration: route.duration, // in seconds
            distance: route.distance, // in meters
            isFlooded: intersection.intersects,
            floodedZones: intersection.intersectedZones,
            // Score = flood penalty + duration (fastest dry route wins, like Waze/Google Maps)
            score: floodPenalty + route.duration
        };
    });

    // Sort by score: dry routes first, then by fastest duration
    analyzedRoutes.sort((a, b) => a.score - b.score);

    const safeRoutes = analyzedRoutes.filter(r => !r.isFlooded);

    // The routes are pre-sorted by score (incorporating duration), so index 0 is the fastest available optimal route
    const safeRoute = analyzedRoutes[0];

    return {
        safeRoute,
        allRoutes: analyzedRoutes,
        hasSafeRoute: safeRoutes.length > 0,
        warnings: safeRoute.isFlooded ? safeRoute.floodedZones : []
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
 * @returns {Promise<Object>} Analyzed route data
 */
export async function getSmartRoute(origin, destination, floodPoints) {
    try {
        // Get routes from Mapbox
        const directionsData = await getDirections(origin, destination, true);

        if (!directionsData.routes || directionsData.routes.length === 0) {
            throw new Error('No routes found');
        }

        // Create flood zone polygons
        const floodZones = createFloodZones(floodPoints);

        // Analyze routes and find safest
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
        return {
            success: false,
            error: error.message
        };
    }
}
