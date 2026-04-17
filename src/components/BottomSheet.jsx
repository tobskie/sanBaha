import { useState, useRef, useEffect } from 'react';
import SensorCard from './SensorCard';
import DestinationSearch from './DestinationSearch';

const COLLAPSED_H = 210;
const expandedH = () => Math.round(window.innerHeight * 0.7);

const BottomSheet = ({
    hotspots,
    selectedHotspot,
    onHotspotSelect,
    onSelectDestination,
    onOpenNavigation,
    onNavigate,
    isExpanded,
    onToggleExpand,
    isRouting,
    userLocation,
    onReport,
    onRefresh,
    isRefreshing,
}) => {
    const [filterStatus, setFilterStatus] = useState('all');
    const [activeTab, setActiveTab] = useState('sensors');
    const [sheetHeight, setSheetHeight] = useState(COLLAPSED_H);
    const [isDragging, setIsDragging] = useState(false);

    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    const lastY = useRef(0);
    const lastTime = useRef(0);
    const velocity = useRef(0); // px/ms, positive = moving up

    // Sync height when parent collapses/expands the sheet externally
    useEffect(() => {
        if (!isDragging) {
            setSheetHeight(isExpanded ? expandedH() : COLLAPSED_H);
        }
    }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

    // Filter hotspots
    const filteredHotspots = hotspots.filter(hotspot =>
        filterStatus === 'all' || hotspot.status === filterStatus
    );

    // Status counts
    const statusCounts = {
        all: hotspots.length,
        clear: hotspots.filter(h => h.status === 'clear').length,
        warning: hotspots.filter(h => h.status === 'warning').length,
        flooded: hotspots.filter(h => h.status === 'flooded').length,
    };

    const startDrag = (y) => {
        dragStartY.current = y;
        dragStartHeight.current = sheetHeight;
        lastY.current = y;
        lastTime.current = Date.now();
        velocity.current = 0;
        setIsDragging(true);
    };

    const moveDrag = (y) => {
        const now = Date.now();
        const dt = now - lastTime.current;
        if (dt > 0) velocity.current = (lastY.current - y) / dt;
        lastY.current = y;
        lastTime.current = now;

        const delta = dragStartY.current - y;
        const newH = Math.max(COLLAPSED_H, Math.min(expandedH(), dragStartHeight.current + delta));
        setSheetHeight(newH);
    };

    const endDrag = () => {
        setIsDragging(false);
        const max = expandedH();
        const mid = (COLLAPSED_H + max) / 2;
        if (velocity.current > 0.4 || sheetHeight > mid) {
            setSheetHeight(max);
            onToggleExpand(true);
        } else {
            setSheetHeight(COLLAPSED_H);
            onToggleExpand(false);
        }
        velocity.current = 0;
    };

    // Touch handlers
    const handleTouchStart = (e) => startDrag(e.touches[0].clientY);
    const handleTouchMove = (e) => moveDrag(e.touches[0].clientY);
    const handleTouchEnd = endDrag;

    // Mouse handlers (desktop)
    const handleMouseDown = (e) => {
        e.preventDefault();
        startDrag(e.clientY);
        const onMove = (ev) => moveDrag(ev.clientY);
        const onUp = () => {
            endDrag();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };


    const showContent = sheetHeight > COLLAPSED_H + 20;

    return (
        <div
            className="absolute left-0 right-0 bottom-0 z-[1001] glass rounded-t-3xl shadow-2xl overflow-hidden"
            style={{
                height: sheetHeight,
                transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            {/* Drag Handle */}
            <div
                className="flex justify-center py-2.5 cursor-grab active:cursor-grabbing touch-none select-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
            >
                <div className="w-10 h-1 bg-slate-500 rounded-full" />
            </div>

            {/* Header Section */}
            <div className="px-3 pb-2">
                {/* Action Row: Report | Search | Refresh */}
                <div className="flex items-center gap-2 mb-2">
                    {/* Report Flood */}
                    <button
                        onClick={onReport}
                        className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 active:scale-95 transition-transform flex-shrink-0"
                        title="Report flood"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </button>

                    {/* Search */}
                    <div className="flex-1">
                        <DestinationSearch
                            onSelectDestination={onSelectDestination}
                            onOpenNavigation={onOpenNavigation}
                            isRouting={isRouting}
                            userLocation={userLocation}
                        />
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className={`w-10 h-10 rounded-xl bg-[#162d4d] flex items-center justify-center text-[#00d4ff] active:scale-95 transition-all flex-shrink-0 ${isRefreshing ? 'opacity-50' : ''}`}
                        title="Refresh data"
                    >
                        <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1.5 p-1 bg-[#0a1628] rounded-xl">
                    <button
                        onClick={() => setActiveTab('sensors')}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'sensors'
                                ? 'bg-[#162d4d] text-[#00d4ff]'
                                : 'text-slate-400'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            Sensors
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('alerts')}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all relative ${activeTab === 'alerts'
                                ? 'bg-[#162d4d] text-[#00d4ff]'
                                : 'text-slate-400'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                            </svg>
                            Alerts
                        </span>
                        {statusCounts.flooded > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                                {statusCounts.flooded}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {showContent && (
                <div className="px-3 pb-3 overflow-hidden">
                    {activeTab === 'sensors' && (
                        <>
                            {/* Status Filter Pills */}
                            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
                                {[
                                    { key: 'all', label: 'All', color: 'bg-slate-500/20 text-slate-300', active: 'bg-[#00d4ff]/20 text-[#00d4ff]' },
                                    { key: 'clear', label: 'Clear', color: 'bg-emerald-500/20 text-emerald-400', active: 'bg-emerald-500/30 text-emerald-300' },
                                    { key: 'warning', label: 'Warning', color: 'bg-amber-500/20 text-amber-400', active: 'bg-amber-500/30 text-amber-300' },
                                    { key: 'flooded', label: 'Flooded', color: 'bg-red-500/20 text-red-400', active: 'bg-red-500/30 text-red-300' },
                                ].map((filter) => (
                                    <button
                                        key={filter.key}
                                        onClick={() => setFilterStatus(filter.key)}
                                        className={`
                      flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all
                      ${filterStatus === filter.key ? filter.active : filter.color}
                    `}
                                    >
                                        {filter.label} ({statusCounts[filter.key]})
                                    </button>
                                ))}
                            </div>

                            {/* Sensor Cards List */}
                            <div className="overflow-y-auto max-h-[calc(70vh-220px)] space-y-2 pr-1">
                                {filteredHotspots.map((hotspot) => (
                                    <div
                                        key={hotspot.id}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="flex-1">
                                            <SensorCard
                                                sensor={hotspot}
                                                isSelected={selectedHotspot?.id === hotspot.id}
                                                onClick={() => {
                                                    onHotspotSelect(hotspot);
                                                    onToggleExpand(false);
                                                }}
                                            />
                                        </div>
                                        {/* Navigate button */}
                                        <button
                                            onClick={() => {
                                                onNavigate(hotspot);
                                                onToggleExpand(false);
                                            }}
                                            disabled={isRouting}
                                            className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center text-[#0a1628] active:scale-95 disabled:opacity-50 flex-shrink-0"
                                            title="Navigate here"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'alerts' && (
                        <div className="space-y-2 overflow-y-auto max-h-[calc(70vh-180px)]">
                            {hotspots.filter(h => h.status === 'flooded').length > 0 ? (
                                hotspots.filter(h => h.status === 'flooded').map((hotspot) => (
                                    <div
                                        key={hotspot.id}
                                        onClick={() => {
                                            onHotspotSelect(hotspot);
                                            onToggleExpand(false);
                                        }}
                                        className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 active:scale-[0.98] transition-transform"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                                            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-red-300 text-sm">{hotspot.name}</h4>
                                            <p className="text-xs text-red-200/70">{hotspot.waterLevel} cm • Not Passable</p>
                                        </div>
                                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8">
                                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <svg className="w-7 h-7 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <h4 className="font-semibold text-emerald-300 text-sm mb-1">All Clear!</h4>
                                    <p className="text-xs text-slate-400">No flood alerts</p>
                                </div>
                            )}

                            {/* Warning alerts */}
                            {hotspots.filter(h => h.status === 'warning').map((hotspot) => (
                                <div
                                    key={hotspot.id}
                                    onClick={() => {
                                        onHotspotSelect(hotspot);
                                        onToggleExpand(false);
                                    }}
                                    className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 active:scale-[0.98] transition-transform"
                                >
                                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-amber-300 text-sm">{hotspot.name}</h4>
                                        <p className="text-xs text-amber-200/70">{hotspot.waterLevel} cm • Caution</p>
                                    </div>
                                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Collapsed Quick Stats */}
            {!showContent && (
                <div className="px-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                            <p className="text-xl font-bold text-emerald-400">{statusCounts.clear}</p>
                            <p className="text-[10px] text-emerald-300/70">Passable</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                            <p className="text-xl font-bold text-amber-400">{statusCounts.warning}</p>
                            <p className="text-[10px] text-amber-300/70">Caution</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center relative">
                            <p className="text-xl font-bold text-red-400">{statusCounts.flooded}</p>
                            <p className="text-[10px] text-red-300/70">Flooded</p>
                            {statusCounts.flooded > 0 && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BottomSheet;
