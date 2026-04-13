import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import Map, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getStatusDetails } from '../data/mockData';
import WeatherWidget from './WeatherWidget';

// Mapbox access token
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';

// Lipa City center coordinates
const LIPA_CENTER = {
    longitude: 121.1589,
    latitude: 13.9411,
    zoom: 13,
};

// Map style options
const MAP_STYLES = {
    dark: {
        id: 'dark',
        name: 'Dark',
        url: 'mapbox://styles/mapbox/dark-v11',
        icon: '🌙',
    },
    satellite: {
        id: 'satellite',
        name: 'Satellite',
        url: 'mapbox://styles/mapbox/satellite-streets-v12',
        icon: '🛰️',
    },
    terrain: {
        id: 'terrain',
        name: 'Terrain',
        url: 'mapbox://styles/mapbox/outdoors-v12',
        icon: '🏔️',
    },
};

// Route layer styles
const routeLayer = {
    id: 'route',
    type: 'line',
    layout: {
        'line-join': 'round',
        'line-cap': 'round',
    },
    paint: {
        'line-color': '#00d4ff',
        'line-width': 5,
        'line-opacity': 0.8,
    },
};

const routeLayerFlooded = {
    id: 'route-flooded',
    type: 'line',
    layout: {
        'line-join': 'round',
        'line-cap': 'round',
    },
    paint: {
        'line-color': '#ff4444',
        'line-width': 5,
        'line-opacity': 0.8,
        'line-dasharray': [2, 2],
    },
};

// Flood zone layer style
const floodZoneLayer = {
    id: 'flood-zones',
    type: 'fill',
    paint: {
        'fill-color': [
            'match',
            ['get', 'status'],
            'flooded', '#ff4444',
            'warning', '#ffcc00',
            'precautionary', '#f59e0b',
            '#ff4444'
        ],
        'fill-opacity': 0.25,
    },
};

const floodZoneOutline = {
    id: 'flood-zones-outline',
    type: 'line',
    paint: {
        'line-color': [
            'match',
            ['get', 'status'],
            'flooded', '#ff4444',
            'warning', '#ffcc00',
            'precautionary', '#f59e0b',
            '#ff4444'
        ],
        'line-width': 2,
        'line-dasharray': [2, 2],
    },
};

// Historical flood zone layer style
const historicalFloodLayer = {
    id: 'historical-flood-zones',
    type: 'fill',
    paint: {
        'fill-color': '#9b59b6', // Purple color for historical to distinguish from real-time
        'fill-opacity': 0.3,
    },
};

const historicalFloodOutline = {
    id: 'historical-flood-zones-outline',
    type: 'line',
    paint: {
        'line-color': '#8e44ad',
        'line-width': 1,
        'line-opacity': 0.8,
    },
};

// Vehicle icon component
const VehicleMarker = ({ heading, acquired }) => (
    <div
        className="relative"
        style={{ transform: `rotate(${heading || 0}deg)` }}
    >
        {acquired ? (
            <>
                {/* Accuracy circle */}
                <div className="absolute -inset-4 rounded-full bg-[#00d4ff]/20 animate-ping" />
                <div className="absolute -inset-3 rounded-full bg-[#00d4ff]/30" />

                {/* Vehicle icon - top-down car */}
                <div className="relative w-8 h-8 flex items-center justify-center">
                    <svg viewBox="0 0 32 40" className="w-7 h-9 drop-shadow-lg" fill="none">
                        {/* Car body */}
                        <rect x="6" y="8" width="20" height="26" rx="4" fill="#0a1628" stroke="#00d4ff" strokeWidth="1.5"/>
                        {/* Cabin/roof */}
                        <rect x="9" y="12" width="14" height="10" rx="2" fill="#00d4ff" fillOpacity="0.25" stroke="#00d4ff" strokeWidth="1"/>
                        {/* Front windshield */}
                        <rect x="10" y="13" width="12" height="5" rx="1.5" fill="#00d4ff" fillOpacity="0.4"/>
                        {/* Front bumper */}
                        <rect x="9" y="8" width="14" height="3" rx="2" fill="#00d4ff" fillOpacity="0.6"/>
                        {/* Rear bumper */}
                        <rect x="9" y="31" width="14" height="3" rx="2" fill="#00d4ff" fillOpacity="0.4"/>
                        {/* Front headlights */}
                        <rect x="7" y="9" width="4" height="2.5" rx="1" fill="#00ff88"/>
                        <rect x="21" y="9" width="4" height="2.5" rx="1" fill="#00ff88"/>
                        {/* Rear lights */}
                        <rect x="7" y="30" width="4" height="2" rx="1" fill="#ff4444" fillOpacity="0.8"/>
                        <rect x="21" y="30" width="4" height="2" rx="1" fill="#ff4444" fillOpacity="0.8"/>
                        {/* Wheels */}
                        <rect x="3" y="11" width="4" height="7" rx="1.5" fill="#00d4ff" fillOpacity="0.7"/>
                        <rect x="25" y="11" width="4" height="7" rx="1.5" fill="#00d4ff" fillOpacity="0.7"/>
                        <rect x="3" y="24" width="4" height="7" rx="1.5" fill="#00d4ff" fillOpacity="0.7"/>
                        <rect x="25" y="24" width="4" height="7" rx="1.5" fill="#00d4ff" fillOpacity="0.7"/>
                    </svg>
                </div>
            </>
        ) : (
            /* Acquiring GPS fix — pulsing amber ring + spinner */
            <>
                <div className="absolute -inset-5 rounded-full bg-amber-400/20 animate-ping" />
                <div className="absolute -inset-4 rounded-full border-2 border-amber-400/40 border-dashed animate-spin" style={{ animationDuration: '3s' }} />
                <div className="relative w-8 h-8 rounded-full bg-[#0a1628] border-2 border-amber-400 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
            </>
        )}
    </div>
);

const FloodMap = forwardRef(({
    hotspots,
    selectedHotspot,
    onHotspotSelect,
    routeData,
    floodZones,
    showFloodZones = true,
    showHistoricalData = false,
    isRaining = false,
    onWeatherUpdate,
    userLocation,
    userHeading,
    isLocationAcquired = false,
    isFollowMode = false,
    bottomOffset = 0,
    onFollowModeChange,
    onError
}, ref) => {
    const [viewState, setViewState] = useState(LIPA_CENTER);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const [popupInfo, setPopupInfo] = useState(null);
    const [mapStyle, setMapStyle] = useState('dark');

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        flyToCenter: () => {
            setViewState({
                ...LIPA_CENTER,
                transitionDuration: 1000,
            });
            setPopupInfo(null);
        },
        flyToLocation: (lat, lng, zoom = 15) => {
            setViewState({
                longitude: lng,
                latitude: lat,
                zoom: zoom,
                transitionDuration: 1000,
            });
        },
        getCurrentLocation: () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setViewState({
                            longitude: position.coords.longitude,
                            latitude: position.coords.latitude,
                            zoom: 16,
                            transitionDuration: 1000,
                        });
                    },
                    (error) => {
                        console.error('Error getting location:', error);
                        if (onError) onError('Could not get your location. Please enable location services.');
                    }
                );
            } else {
                if (onError) onError('Geolocation is not supported by your browser.');
            }
        },
        fitToRoute: (bounds) => {
            // Fit map to show entire route
            if (bounds) {
                setViewState({
                    ...viewState,
                    longitude: (bounds[0] + bounds[2]) / 2,
                    latitude: (bounds[1] + bounds[3]) / 2,
                    zoom: 13,
                    transitionDuration: 1000,
                });
            }
        },
        followUser: () => {
            if (userLocation) {
                setViewState({
                    longitude: userLocation[0],
                    latitude: userLocation[1],
                    zoom: 17,
                    transitionDuration: 500,
                });
            }
        },
    }));

    // Fly to selected hotspot when it changes
    useEffect(() => {
        if (selectedHotspot) {
            setViewState({
                longitude: selectedHotspot.coordinates[1],
                latitude: selectedHotspot.coordinates[0],
                zoom: 15,
                transitionDuration: 800,
            });
            setPopupInfo(selectedHotspot);
        }
    }, [selectedHotspot]);

    // Follow mode - track user location like Google Maps/Waze
    useEffect(() => {
        if (isFollowMode && userLocation) {
            setViewState(prev => ({
                ...prev,
                longitude: userLocation[0],
                latitude: userLocation[1],
                zoom: prev.zoom < 16 ? 16 : prev.zoom, // Zoom in if too far out
                bearing: userHeading || 0, // Rotate map based on heading
                pitch: 45, // Tilt for 3D perspective like driving mode
                transitionDuration: 500,
            }));
        }
    }, [isFollowMode, userLocation, userHeading]);

    // Handle hotspot click
    const handleHotspotClick = useCallback((e, hotspot) => {
        e.originalEvent.stopPropagation();
        onHotspotSelect(hotspot);
    }, [onHotspotSelect]);

    // Close popup when clicking map
    const handleMapClick = useCallback(() => {
        setPopupInfo(null);
    }, []);

    const getMarkerColor = (status) => {
        switch (status) {
            case 'clear': return '#00ff88';
            case 'warning': return '#ffcc00';
            case 'flooded': return '#ff4444';
            default: return '#00d4ff';
        }
    };

    // Create route GeoJSON
    const routeGeoJSON = routeData?.safeRoute?.geometry ? {
        type: 'Feature',
        geometry: routeData.safeRoute.geometry,
        properties: {
            isFlooded: routeData.safeRoute.isFlooded
        }
    } : null;

    // Handle map move - disable follow mode if user pans manually
    const handleMapMove = useCallback((evt) => {
        setViewState(evt.viewState);

        // If user interacts with the map during navigation, disable follow mode
        if (isFollowMode && evt.originalEvent) {
            // Only disable if it's a user interaction (drag, pinch, etc.)
            const isUserInteraction = ['mousedown', 'touchstart', 'wheel'].some(
                type => evt.originalEvent.type?.startsWith(type.substring(0, 5))
            );
            if (isUserInteraction && onFollowModeChange) {
                onFollowModeChange(false);
            }
        }
    }, [isFollowMode, onFollowModeChange]);

    return (
        <div className="relative w-full h-full">
            <Map
                {...viewState}
                onMove={handleMapMove}
                onClick={handleMapClick}
                style={{ width: '100%', height: '100%' }}
                mapStyle={MAP_STYLES[mapStyle].url}
                mapboxAccessToken={MAPBOX_TOKEN}
                attributionControl={false}
            >
                {/* Navigation Controls */}
                <NavigationControl position="top-left" showCompass={true} />

                {/* Flood Zone Polygons */}
                {showFloodZones && floodZones && (
                    <Source id="flood-zones" type="geojson" data={floodZones}>
                        <Layer {...floodZoneLayer} />
                        <Layer {...floodZoneOutline} />
                    </Source>
                )}

                {/* Historical Flood Zone Polygons */}
                {showHistoricalData && (
                    <Source id="historical-flood-zones-src" type="geojson" data="/data/batangas_flood_5yr.geojson">
                        <Layer {...historicalFloodLayer} />
                        <Layer {...historicalFloodOutline} />
                    </Source>
                )}

                {/* Route Line */}
                {routeGeoJSON && (
                    <Source id="route" type="geojson" data={routeGeoJSON}>
                        <Layer {...(routeData.safeRoute.isFlooded ? routeLayerFlooded : routeLayer)} />
                    </Source>
                )}

                {/* User Location / Vehicle Marker */}
                {userLocation && (
                    <Marker
                        longitude={userLocation[0]}
                        latitude={userLocation[1]}
                        anchor="center"
                    >
                        <VehicleMarker heading={userHeading} acquired={isLocationAcquired} />
                    </Marker>
                )}

                {/* Flood Hotspot Markers */}
                {hotspots.map((hotspot) => (
                    <Marker
                        key={hotspot.id}
                        longitude={hotspot.coordinates[1]}
                        latitude={hotspot.coordinates[0]}
                        anchor="center"
                        onClick={(e) => handleHotspotClick(e, hotspot)}
                    >
                        <div
                            className={`
                relative cursor-pointer transition-transform hover:scale-110
                ${hotspot.status === 'flooded' ? 'animate-pulse' : ''}
                ${selectedHotspot?.id === hotspot.id ? 'scale-125' : ''}
              `}
                        >
                            {/* Outer ring */}
                            <div
                                className="absolute -inset-2 rounded-full opacity-30"
                                style={{
                                    backgroundColor: getMarkerColor(hotspot.status),
                                    animation: hotspot.status === 'flooded' ? 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' : 'none'
                                }}
                            />
                            {/* Inner circle */}
                            <div
                                className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
                                style={{ backgroundColor: getMarkerColor(hotspot.status) }}
                            />
                            {/* Crowdsourced indicator */}
                            {hotspot.type === 'crowdsourced' && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-white flex items-center justify-center">
                                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </Marker>
                ))}

                {/* Popup for selected hotspot */}
                {popupInfo && (
                    <Popup
                        longitude={popupInfo.coordinates[1]}
                        latitude={popupInfo.coordinates[0]}
                        anchor="bottom"
                        onClose={() => setPopupInfo(null)}
                        closeButton={false}
                        closeOnClick={false}
                        offset={15}
                    >
                        <div className="bg-[#0f2035] text-white p-3 rounded-lg min-w-[180px]">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-bold text-sm mb-1">{popupInfo.name}</h3>
                                {popupInfo.type === 'crowdsourced' && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[8px] rounded font-medium">
                                        USER REPORT
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2">{popupInfo.location}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">Water Level:</span>
                                <span className={`font-bold text-sm ${popupInfo.status === 'clear' ? 'text-emerald-400' :
                                    popupInfo.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                    {popupInfo.waterLevel} cm
                                </span>
                            </div>
                            <div className={`
                mt-2 text-center py-1 rounded text-[10px] font-medium
                ${popupInfo.status === 'clear' ? 'bg-emerald-500/20 text-emerald-300' :
                                    popupInfo.status === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-red-500/20 text-red-300'}
              `}>
                                {getStatusDetails(popupInfo.status).label}
                            </div>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Compact Control Panel - Top Right */}
            <div className="absolute top-4 right-3 z-10 flex flex-col gap-1.5">
                {/* Map Style Switcher - Horizontal */}
                <div className="glass rounded-xl p-1 flex gap-0.5">
                    {Object.values(MAP_STYLES).map((style) => (
                        <button
                            key={style.id}
                            onClick={() => setMapStyle(style.id)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all ${mapStyle === style.id
                                ? 'bg-[#00d4ff]/20 ring-1 ring-[#00d4ff]/40'
                                : 'opacity-50 hover:opacity-100'
                                }`}
                            title={style.name}
                        >
                            {style.icon}
                        </button>
                    ))}
                </div>

                {/* Quick Actions - Horizontal */}
                <div className="glass rounded-xl p-1 flex gap-0.5">
                    {/* My Location */}
                    {userLocation && (
                        <button
                            onClick={() => {
                                setViewState({
                                    ...viewState,
                                    longitude: userLocation[0],
                                    latitude: userLocation[1],
                                    zoom: 16,
                                    pitch: 0,
                                    bearing: 0,
                                    transitionDuration: 800,
                                });
                            }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#00d4ff] hover:bg-[#162d4d] transition-all active:scale-95"
                            title="My location"
                        >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}

                    {/* Center on Lipa */}
                    <button
                        onClick={() => {
                            setViewState({
                                ...LIPA_CENTER,
                                pitch: 0,
                                bearing: 0,
                                transitionDuration: 800,
                            });
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#162d4d] transition-all active:scale-95"
                        title="Center on Lipa City"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>

                    {/* Reset View (North up) */}
                    <button
                        onClick={() => {
                            setViewState(prev => ({
                                ...prev,
                                pitch: 0,
                                bearing: 0,
                                transitionDuration: 500,
                            }));
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#162d4d] transition-all active:scale-95"
                        title="Reset view (North up)"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </button>
                </div>

                {/* Legend - Horizontal Dots */}
                <div className="glass rounded-xl px-2 py-1.5 flex items-center gap-2">
                    <div className="flex items-center gap-1" title="Clear">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[8px] text-slate-400">OK</span>
                    </div>
                    <div className="flex items-center gap-1" title="Warning">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-[8px] text-slate-400">!</span>
                    </div>
                    <div className="flex items-center gap-1" title="Flooded">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[8px] text-slate-400">⚠</span>
                    </div>
                </div>
            </div>

            {/* Route Info Badge */}
            {routeData?.safeRoute && (
                <div className={`absolute top-4 left-14 z-10 rounded-xl px-3 py-2 ${routeData.safeRoute.isFlooded
                    ? 'bg-red-500/20 border border-red-500/30'
                    : 'bg-emerald-500/20 border border-emerald-500/30'
                    }`}>
                    <div className="flex items-center gap-2">
                        {routeData.safeRoute.isFlooded ? (
                            <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        )}
                        <span className={`text-[10px] font-medium ${routeData.safeRoute.isFlooded ? 'text-red-300' : 'text-emerald-300'
                            }`}>
                            {routeData.safeRoute.isFlooded ? 'Flood on Route' : 'Safe Route'}
                        </span>
                    </div>
                </div>
            )}

            {/* GPS Status */}
            <div className="absolute right-4 z-10 glass rounded-xl px-3 py-1.5 flex items-center gap-2 transition-all duration-300"
                style={{ bottom: bottomOffset + 16 }}>
                <span className={`w-2 h-2 rounded-full animate-pulse ${
                    !isOnline ? 'bg-slate-500' :
                    !isLocationAcquired ? 'bg-amber-400' :
                    isFollowMode ? 'bg-[#00ff88]' : 'bg-[#00d4ff]'
                }`} />
                <span className="text-[10px] text-slate-300">
                    {!isOnline ? 'Offline' :
                     !isLocationAcquired ? 'Acquiring GPS…' :
                     isFollowMode ? 'Navigating' : 'GPS Active'}
                </span>
            </div>

            {/* Re-center Button - appears when user pans away during navigation */}
            {routeData && !isFollowMode && onFollowModeChange && (
                <button
                    onClick={() => onFollowModeChange(true)}
                    className="absolute right-4 z-10 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628] font-semibold text-xs shadow-lg shadow-[#00d4ff]/30 flex items-center gap-2 active:scale-95 transition-all duration-300"
                    style={{ bottom: bottomOffset + 64 }}
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    Re-center
                </button>
            )}

            {/* Weather Widget + Info */}
            <div className="absolute left-4 z-10 transition-all duration-300"
                style={{ bottom: bottomOffset + 16 }}>
                <WeatherWidget onWeatherUpdate={onWeatherUpdate} />
            </div>

            {/* Historical zones active badge */}
            {showHistoricalData && isRaining && (
                <div className="absolute left-4 z-10 glass rounded-lg px-2.5 py-1 flex items-center gap-1.5 transition-all duration-300"
                    style={{ bottom: bottomOffset + 72 }}>
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-[9px] text-purple-300 font-medium">🕐 Historical zones active in routing</span>
                </div>
            )}
        </div>
    );
});

FloodMap.displayName = 'FloodMap';

export default FloodMap;
