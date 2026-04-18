// src/components/Sidebar.jsx
import SensorCard from './SensorCard';
import HotspotDetail from './HotspotDetail';
import DestinationSearch from './DestinationSearch';

const Sidebar = ({
  isOpen,
  onToggle,
  hotspots,
  selectedHotspot,
  onHotspotSelect,
  onNavigate,
  isRouting,
  onReport,
  onSelectDestination,
  onOpenNavigation,
  userLocation,
  isRefreshing,
  onRefresh,
  onError,
}) => {
  const statusCounts = {
    clear: hotspots.filter(h => h.status === 'clear').length,
    warning: hotspots.filter(h => h.status === 'warning').length,
    flooded: hotspots.filter(h => h.status === 'flooded').length,
  };

  return (
    <>
      {/* Re-open tab — visible only when sidebar is collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-[1002] w-6 h-14 bg-[#162d4d] border border-[#00d4ff]/20 border-l-0 rounded-r-xl items-center justify-center text-slate-400 hover:text-[#00d4ff] transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Sidebar panel */}
      <div
        className="hidden md:flex flex-col absolute left-0 top-0 bottom-0 z-[1001] w-[320px] bg-[#0a1628]/95 backdrop-blur-md border-r border-[#00d4ff]/20"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-320px)',
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#0a1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm">sanBaha</span>
          </div>
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedHotspot ? (
            /* Hotspot detail view */
            <div className="p-3">
              <button
                onClick={() => onHotspotSelect(null)}
                className="flex items-center gap-2 text-slate-400 hover:text-white text-xs mb-3 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to list
              </button>
              <HotspotDetail
                hotspot={selectedHotspot}
                onClose={() => onHotspotSelect(null)}
                onNavigate={() => onNavigate(selectedHotspot)}
                isRouting={isRouting}
                onError={onError}
                inline={true}
              />
            </div>
          ) : (
            /* Default flood stats + list view */
            <div className="p-3 space-y-3">
              {/* Search */}
              <DestinationSearch
                onSelectDestination={onSelectDestination}
                onOpenNavigation={onOpenNavigation}
                isRouting={isRouting}
                userLocation={userLocation}
              />

              {/* Status summary */}
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

              {/* Action row */}
              <div className="flex gap-2">
                <button
                  onClick={onReport}
                  className="flex-1 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center gap-2 text-amber-400 text-xs font-medium active:scale-95 transition-transform"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Report Flood
                </button>
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className={`w-10 h-9 rounded-xl bg-[#162d4d] flex items-center justify-center text-[#00d4ff] active:scale-95 transition-all flex-shrink-0 ${isRefreshing ? 'opacity-50' : ''}`}
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Hotspot list */}
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">All Locations</p>
                {hotspots.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No data yet</p>
                ) : (
                  hotspots.map(hotspot => (
                    <SensorCard
                      key={hotspot.id}
                      sensor={hotspot}
                      isSelected={false}
                      onClick={() => onHotspotSelect(hotspot)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
