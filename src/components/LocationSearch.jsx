import { useState, useEffect, useRef } from 'react';
import { searchLocations } from '../services/routingService';

const LocationSearch = ({
    label,
    placeholder,
    value,
    onChange,
    onSelect,
    icon,
    disabled
}) => {
    const [query, setQuery] = useState(value?.name || '');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    // Debounced search
    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsLoading(true);
            const locations = await searchLocations(query);
            setResults(locations);
            setIsLoading(false);
            setIsOpen(locations.length > 0);
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    // Update query when value changes externally
    useEffect(() => {
        if (value?.name) {
            setQuery(value.name);
        }
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                inputRef.current && !inputRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (location) => {
        setQuery(location.name);
        setIsOpen(false);
        setResults([]);
        onSelect(location);
    };

    const handleInputChange = (e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        onChange?.(newQuery);
        if (!newQuery) {
            onSelect(null);
        }
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setIsOpen(false);
        onSelect(null);
        inputRef.current?.focus();
    };

    return (
        <div className="relative">
            {/* Label */}
            {label && (
                <label className="block text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                    {label}
                </label>
            )}

            {/* Input Container */}
            <div className="relative">
                {/* Icon */}
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {icon || (
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}
                </div>

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => results.length > 0 && setIsOpen(true)}
                    disabled={disabled}
                    className="w-full pl-10 pr-10 py-2.5 bg-[#0a1628] border border-[#162d4d] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30 transition-all disabled:opacity-50"
                />

                {/* Loading/Clear Button */}
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                    {isLoading ? (
                        <svg className="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                    ) : query ? (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="w-6 h-6 rounded-full bg-[#162d4d] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && results.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute left-0 right-0 top-full mt-1 z-50 glass rounded-xl overflow-hidden shadow-xl border border-[#00d4ff]/20 max-h-[40vh] overflow-y-auto overscroll-contain"
                >
                    {results.map((location) => (
                        <button
                            key={location.id}
                            onClick={() => handleSelect(location)}
                            className="w-full px-4 py-3 text-left hover:bg-[#162d4d] transition-colors flex items-start gap-3 border-b border-[#00d4ff]/10 last:border-b-0"
                        >
                            {/* Category Icon */}
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${location.category === 'landmark' ? 'bg-amber-500/20' :
                                    location.category === 'address' ? 'bg-[#00d4ff]/20' :
                                        location.category === 'neighborhood' ? 'bg-purple-500/20' :
                                            location.category === 'city' ? 'bg-emerald-500/20' :
                                                'bg-slate-500/20'
                                }`}>
                                {location.category === 'landmark' ? (
                                    <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" clipRule="evenodd" />
                                    </svg>
                                ) : location.category === 'address' ? (
                                    <svg className="w-3.5 h-3.5 text-[#00d4ff]" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                    </svg>
                                ) : location.category === 'neighborhood' ? (
                                    <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                    </svg>
                                ) : location.category === 'city' ? (
                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white truncate">{location.name}</p>
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${location.category === 'landmark' ? 'bg-amber-500/20 text-amber-300' :
                                            location.category === 'address' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' :
                                                location.category === 'neighborhood' ? 'bg-purple-500/20 text-purple-300' :
                                                    location.category === 'city' ? 'bg-emerald-500/20 text-emerald-300' :
                                                        'bg-slate-500/20 text-slate-300'
                                        }`}>
                                        {location.category === 'landmark' ? 'Place' :
                                            location.category === 'address' ? 'Address' :
                                                location.category === 'neighborhood' ? 'Barangay' :
                                                    location.category === 'city' ? 'City' : 'Location'}
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate">{location.address}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LocationSearch;
