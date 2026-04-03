import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchLocations } from '../services/routingService';

const DestinationSearch = ({
    onSelectDestination,
    onOpenNavigation,
    isRouting,
    userLocation,
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const inputRef = useRef(null);
    const panelRef = useRef(null);
    const debounceRef = useRef(null);

    // Load recent searches from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('sanBaha_recentSearches');
            if (saved) setRecentSearches(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    // Save a search to recents
    const saveRecentSearch = useCallback((location) => {
        setRecentSearches(prev => {
            const filtered = prev.filter(r => r.id !== location.id);
            const updated = [location, ...filtered].slice(0, 5);
            try {
                localStorage.setItem('sanBaha_recentSearches', JSON.stringify(updated));
            } catch { /* ignore */ }
            return updated;
        });
    }, []);

    // Debounced search
    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const locations = await searchLocations(query);
                setResults(locations);
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const handleExpand = () => {
        setIsExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 150);
    };

    const handleCollapse = () => {
        setIsExpanded(false);
        setQuery('');
        setResults([]);
        setFocusedIndex(-1);
    };

    const handleSelect = (location) => {
        saveRecentSearch(location);
        handleCollapse();
        onSelectDestination(location);
    };

    const handleClearRecent = (e, id) => {
        e.stopPropagation();
        setRecentSearches(prev => {
            const updated = prev.filter(r => r.id !== id);
            try {
                localStorage.setItem('sanBaha_recentSearches', JSON.stringify(updated));
            } catch { /* ignore */ }
            return updated;
        });
    };

    const handleKeyDown = (e) => {
        const list = results.length > 0 ? results : (query.length < 2 ? recentSearches : []);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => Math.min(prev + 1, list.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && focusedIndex >= 0 && list[focusedIndex]) {
            e.preventDefault();
            handleSelect(list[focusedIndex]);
        } else if (e.key === 'Escape') {
            handleCollapse();
        }
    };

    const getCategoryIcon = (category) => {
        switch (category) {
            case 'landmark':
                return (
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" clipRule="evenodd" />
                        </svg>
                    </div>
                );
            case 'address':
                return (
                    <div className="w-9 h-9 rounded-xl bg-[#00d4ff]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[#00d4ff]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                    </div>
                );
            case 'neighborhood':
                return (
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>
                );
            case 'city':
                return (
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                        </svg>
                    </div>
                );
            default:
                return (
                    <div className="w-9 h-9 rounded-xl bg-slate-500/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                    </div>
                );
        }
    };

    const getCategoryLabel = (category) => {
        switch (category) {
            case 'landmark': return 'Place';
            case 'address': return 'Address';
            case 'neighborhood': return 'Barangay';
            case 'city': return 'City';
            default: return 'Location';
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'landmark': return 'bg-amber-500/20 text-amber-300';
            case 'address': return 'bg-[#00d4ff]/20 text-[#00d4ff]';
            case 'neighborhood': return 'bg-purple-500/20 text-purple-300';
            case 'city': return 'bg-emerald-500/20 text-emerald-300';
            default: return 'bg-slate-500/20 text-slate-300';
        }
    };

    // Highlight matching text in search results
    const highlightMatch = (text, searchQuery) => {
        if (!searchQuery || searchQuery.length < 2) return text;
        const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? (
                <span key={i} className="text-[#00d4ff] font-semibold">{part}</span>
            ) : (
                <span key={i}>{part}</span>
            )
        );
    };

    // The expanded full-panel search (rendered via portal to escape BottomSheet clipping)
    const expandedPanel = isExpanded ? createPortal(
        <div
            className="absolute inset-0 z-[2500] flex flex-col"
            ref={panelRef}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[#0a1628]/95 backdrop-blur-md" onClick={handleCollapse} />

            {/* Search Panel */}
            <div className="relative flex flex-col h-full animate-search-expand">
                {/* Header */}
                <div className="px-4 pt-4 pb-2 flex items-center gap-3">
                    <button
                        onClick={handleCollapse}
                        className="w-10 h-10 rounded-xl bg-[#162d4d] flex items-center justify-center text-slate-300 active:scale-95 transition-transform flex-shrink-0"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    {/* Search Input */}
                    <div className="relative flex-1">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search a destination..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setFocusedIndex(-1);
                            }}
                            onKeyDown={handleKeyDown}
                            className="w-full px-4 py-3 bg-[#162d4d] border border-[#00d4ff]/30 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 transition-all"
                        />
                        {/* Loading or Clear */}
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                            {isSearching ? (
                                <div className="w-5 h-5 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
                            ) : query ? (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                                    className="w-6 h-6 rounded-full bg-[#0a1628] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            ) : (
                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="mx-4 h-px bg-gradient-to-r from-transparent via-[#00d4ff]/20 to-transparent" />

                {/* Results Area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">

                    {/* Search Results */}
                    {results.length > 0 && (
                        <>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium px-1 mb-2">
                                Search Results
                            </p>
                            {results.map((location, index) => (
                                <button
                                    key={location.id}
                                    onClick={() => handleSelect(location)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                                        focusedIndex === index
                                            ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30'
                                            : 'hover:bg-[#162d4d] border border-transparent'
                                    }`}
                                >
                                    {getCategoryIcon(location.category)}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-white truncate">
                                                {highlightMatch(location.name, query)}
                                            </p>
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full uppercase font-medium flex-shrink-0 ${getCategoryColor(location.category)}`}>
                                                {getCategoryLabel(location.category)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{location.address}</p>
                                    </div>
                                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            ))}
                        </>
                    )}

                    {/* No results state */}
                    {query.length >= 2 && !isSearching && results.length === 0 && (
                        <div className="text-center py-10">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#162d4d] flex items-center justify-center mb-3">
                                <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-sm text-slate-400 font-medium">No places found</p>
                            <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
                        </div>
                    )}

                    {/* Recent Searches & Quick Actions (when no query) */}
                    {query.length < 2 && !isSearching && (
                        <>
                            {/* Quick Action: Use Navigation Panel */}
                            <button
                                onClick={() => {
                                    handleCollapse();
                                    onOpenNavigation();
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#00d4ff]/5 to-[#00ff88]/5 border border-[#00d4ff]/15 hover:border-[#00d4ff]/30 transition-all active:scale-[0.98] mb-3"
                            >
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00d4ff]/20 to-[#00ff88]/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="text-sm font-medium text-white">Set origin & destination</p>
                                    <p className="text-[11px] text-slate-400">Full navigation with custom start point</p>
                                </div>
                                <svg className="w-4 h-4 text-[#00d4ff] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {/* Recent Searches */}
                            {recentSearches.length > 0 && (
                                <>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium px-1 mb-2">
                                        Recent
                                    </p>
                                    {recentSearches.map((location, index) => (
                                        <button
                                            key={location.id}
                                            onClick={() => handleSelect(location)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                                                focusedIndex === index
                                                    ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30'
                                                    : 'hover:bg-[#162d4d] border border-transparent'
                                            }`}
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-[#162d4d] flex items-center justify-center flex-shrink-0">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0 text-left">
                                                <p className="text-sm font-medium text-white truncate">{location.name}</p>
                                                <p className="text-[11px] text-slate-400 truncate mt-0.5">{location.address}</p>
                                            </div>
                                            <button
                                                onClick={(e) => handleClearRecent(e, location.id)}
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </button>
                                    ))}
                                </>
                            )}

                            {/* Empty state when no recent searches */}
                            {recentSearches.length === 0 && (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#00d4ff]/10 to-[#00ff88]/10 border border-[#00d4ff]/10 flex items-center justify-center mb-3">
                                        <svg className="w-8 h-8 text-[#00d4ff]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-slate-400 font-medium">Search for a destination</p>
                                    <p className="text-xs text-slate-500 mt-1">Enter a place, address, or barangay in Lipa City</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Searching shimmer */}
                    {isSearching && query.length >= 2 && results.length === 0 && (
                        <div className="space-y-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                                    <div className="w-9 h-9 rounded-xl shimmer flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 rounded-lg shimmer w-3/4" />
                                        <div className="h-2.5 rounded-lg shimmer w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-3 border-t border-[#162d4d]">
                    <p className="text-[10px] text-slate-500 text-center">
                        Powered by Mapbox & OpenStreetMap • Results near Lipa City
                    </p>
                </div>
            </div>
        </div>,
        // Portal into the app's root container (escapes BottomSheet's overflow-hidden)
        document.getElementById('search-portal') || document.body
    ) : null;

    return (
        <>
            {/* Collapsed "pill" search bar */}
            <button
                onClick={handleExpand}
                className="destination-search-pill w-full relative group"
                id="destination-search-trigger"
            >
                <div className="flex items-center gap-3 w-full px-4 py-3 bg-[#0a1628] border border-[#162d4d] rounded-2xl transition-all duration-300 group-hover:border-[#00d4ff]/40 group-active:scale-[0.98]">
                    {/* Search icon with glow */}
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d4ff]/20 to-[#00ff88]/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <span className="text-sm text-slate-400 flex-1 text-left">Where are you going?</span>
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3.5 h-3.5 text-[#0a1628]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </div>
                </div>
            </button>

            {/* Expanded search panel (portaled to escape overflow clipping) */}
            {expandedPanel}
        </>
    );
};

export default DestinationSearch;
