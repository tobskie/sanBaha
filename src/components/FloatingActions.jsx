const FloatingActions = ({ onNavigate, onReport, onRefresh, isRefreshing, bottomOffset = 260 }) => {
    return (
        <div className="absolute right-3 z-[1000] flex flex-col gap-2 transition-all duration-300"
            style={{ bottom: bottomOffset + 20 }}>
            {/* Report Flood Button */}
            <button
                onClick={onReport}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 shadow-lg shadow-amber-500/30 flex items-center justify-center text-white active:scale-95 transition-transform"
                title="Report flood"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Navigate Button */}
            <button
                onClick={onNavigate}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00ff88] shadow-lg shadow-[#00d4ff]/30 flex items-center justify-center text-[#0a1628] active:scale-95 transition-transform"
                title="Navigate"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
            </button>

            {/* Refresh Button */}
            <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={`
                    w-12 h-12 rounded-2xl glass shadow-lg
                    flex items-center justify-center
                    text-[#00d4ff] active:scale-95 transition-all
                    ${isRefreshing ? 'opacity-50' : ''}
                `}
                title="Refresh data"
            >
                <svg
                    className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            </button>
        </div>
    );
};

export default FloatingActions;
