import { useState, useEffect } from 'react';
import LocationSearch from './LocationSearch';
import { reverseGeocode } from '../services/routingService';

const NavigationPanel = ({
    origin,
    destination,
    onOriginChange,
    onDestinationChange,
    onNavigate,
    onClose,
    isRouting,
    userLocation,
    vehicle,
}) => {
    const [originLocation, setOriginLocation] = useState(origin);
    const [destLocation, setDestLocation] = useState(destination);
    const [useCurrentLocation, setUseCurrentLocation] = useState(true);

    // Set origin to user location when component mounts
    useEffect(() => {
        if (userLocation && useCurrentLocation && !originLocation) {
            reverseGeocode(userLocation).then(location => {
                setOriginLocation(location);
                onOriginChange?.(location);
            });
        }
    }, [userLocation, useCurrentLocation]);

    const handleOriginSelect = (location) => {
        setOriginLocation(location);
        setUseCurrentLocation(false);
        onOriginChange?.(location);
    };

    const handleDestSelect = (location) => {
        setDestLocation(location);
        onDestinationChange?.(location);
    };

    const handleUseCurrentLocation = async () => {
        if (userLocation) {
            setUseCurrentLocation(true);
            const location = await reverseGeocode(userLocation);
            setOriginLocation(location);
            onOriginChange?.(location);
        }
    };

    const handleSwapLocations = () => {
        const temp = originLocation;
        setOriginLocation(destLocation);
        setDestLocation(temp);
        setUseCurrentLocation(false);
        onOriginChange?.(destLocation);
        onDestinationChange?.(temp);
    };

    const handleNavigate = () => {
        if (originLocation?.coordinates && destLocation?.coordinates) {
            onNavigate(originLocation.coordinates, destLocation.coordinates);
        }
    };

    const canNavigate = originLocation?.coordinates && destLocation?.coordinates;

    return (
        <div className="absolute inset-x-3 top-20 z-[1002]">
            <div className="glass rounded-2xl p-4 shadow-xl border border-[#00d4ff]/20">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        Navigate
                        {vehicle && (
                            <span className="text-[10px] text-[#00d4ff]/70 font-normal ml-1">
                                {vehicle.name}
                            </span>
                        )}
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Location Inputs */}
                <div className="relative">
                    {/* Connection Line */}
                    <div className="absolute left-[18px] top-10 bottom-12 w-0.5 bg-gradient-to-b from-[#00d4ff] to-[#00ff88] rounded-full" />

                    {/* Origin Input */}
                    <div className="relative mb-3">
                        <LocationSearch
                            label="From"
                            placeholder="Enter starting point"
                            value={originLocation}
                            onSelect={handleOriginSelect}
                            onChange={() => setUseCurrentLocation(false)}
                            icon={
                                <div className="w-3 h-3 rounded-full bg-[#00d4ff] border-2 border-white" />
                            }
                        />
                        {/* Use Current Location Button */}
                        {userLocation && !useCurrentLocation && (
                            <button
                                onClick={handleUseCurrentLocation}
                                className="mt-1 text-[10px] text-[#00d4ff] flex items-center gap-1 hover:underline"
                            >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                Use current location
                            </button>
                        )}
                    </div>

                    {/* Swap Button */}
                    <button
                        onClick={handleSwapLocations}
                        className="absolute left-[11px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#162d4d] border border-[#00d4ff]/30 flex items-center justify-center text-[#00d4ff] hover:bg-[#1e3a5f] transition-colors z-10"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                    </button>

                    {/* Destination Input */}
                    <LocationSearch
                        label="To"
                        placeholder="Enter destination"
                        value={destLocation}
                        onSelect={handleDestSelect}
                        icon={
                            <div className="w-3 h-3 rounded-full bg-[#00ff88] border-2 border-white" />
                        }
                    />
                </div>

                {/* Navigate Button */}
                <button
                    onClick={handleNavigate}
                    disabled={!canNavigate || isRouting}
                    className={`
            w-full mt-4 py-3 rounded-xl font-medium text-sm
            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
            ${canNavigate && !isRouting
                            ? 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628]'
                            : 'bg-[#162d4d] text-slate-500 cursor-not-allowed'}
          `}
                >
                    {isRouting ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                            Finding route...
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            Get Directions
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default NavigationPanel;
