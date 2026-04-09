import { useState, useEffect } from 'react';
import sanBahaLogo from '../img/sanBaha-logo.png';

const MobileHeader = ({ lastUpdate, onMenuClick, onNavigateClick, isAdmin = false, pendingReviewCount = 0 }) => {
    const [isOnline, setIsOnline] = useState(true);

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

    const formatTime = (date) => {
        return date.toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <header className="absolute top-0 left-0 right-0 z-[1002]">
            <div className="glass border-b border-[#00d4ff]/10">
                <div className="flex items-center justify-between px-4 py-3">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <img
                            src={sanBahaLogo}
                            alt="sanBaha Logo"
                            className="w-9 h-9 rounded-xl object-contain"
                        />
                        <div>
                            <h1 className="text-base font-bold gradient-text leading-tight">sanBaha</h1>
                            <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-[10px] text-slate-400">
                                    {isOnline ? 'Live' : 'Offline'} • {formatTime(lastUpdate)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {/* Navigate Button */}
                        <button
                            onClick={onNavigateClick}
                            className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#00d4ff]/20 to-[#00ff88]/20 border border-[#00d4ff]/30 flex items-center justify-center text-[#00d4ff] active:scale-95 transition-transform"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                        </button>

                        {/* Menu Button */}
                        <div className="relative">
                            <button
                                onClick={onMenuClick}
                                className="w-9 h-9 rounded-xl bg-[#162d4d] flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                {isAdmin && pendingReviewCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                                        {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default MobileHeader;
