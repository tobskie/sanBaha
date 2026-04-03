import { useState, useEffect } from 'react';
import { getStatusDetails } from '../data/mockData';

const SensorCard = ({ sensor, isSelected, onClick }) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const statusDetails = getStatusDetails(sensor.status);

    // Animate when water level changes
    useEffect(() => {
        setIsAnimating(true);
        const timer = setTimeout(() => setIsAnimating(false), 500);
        return () => clearTimeout(timer);
    }, [sensor.waterLevel]);

    const getStatusIcon = () => {
        switch (sensor.status) {
            case 'clear':
                return (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                );
            case 'warning':
                return (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                );
            case 'flooded':
                return (
                    <svg className="w-5 h-5 blink" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const getWaterLevelBar = () => {
        const percentage = Math.min(100, (sensor.waterLevel / 100) * 100);
        return (
            <div className="relative h-2 bg-[#0a1628] rounded-full overflow-hidden">
                <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${sensor.status === 'clear' ? 'bg-emerald-400' :
                            sensor.status === 'warning' ? 'bg-amber-400' : 'bg-red-500'
                        }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        );
    };

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <div
            onClick={onClick}
            className={`
        glass-card rounded-xl p-4 cursor-pointer transition-smooth
        hover:scale-[1.02] hover:border-[#00d4ff]/30
        ${isSelected ? 'ring-2 ring-[#00d4ff] border-[#00d4ff]/50' : ''}
        ${sensor.status === 'flooded' ? 'pulse-alert' : ''}
        ${isAnimating ? 'scale-[1.02]' : ''}
      `}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="font-semibold text-white text-sm truncate max-w-[140px]">
                        {sensor.name}
                    </h3>
                    <p className="text-xs text-slate-400 truncate max-w-[140px]">
                        {sensor.location}
                    </p>
                </div>
                <div
                    className={`
            flex items-center justify-center w-8 h-8 rounded-lg
            ${sensor.status === 'clear' ? 'bg-emerald-500/20 text-emerald-400' :
                            sensor.status === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-red-500/20 text-red-400'}
          `}
                >
                    {getStatusIcon()}
                </div>
            </div>

            {/* Water Level Display */}
            <div className="mb-3">
                <div className="flex items-end justify-between mb-1">
                    <span className="text-xs text-slate-400">Water Level</span>
                    <span className={`
            text-2xl font-bold
            ${sensor.status === 'clear' ? 'text-emerald-400' :
                            sensor.status === 'warning' ? 'text-amber-400' : 'text-red-400'}
          `}>
                        {sensor.waterLevel}
                        <span className="text-sm font-normal ml-1">cm</span>
                    </span>
                </div>
                {getWaterLevelBar()}
            </div>

            {/* Status Badge */}
            <div className="flex items-center justify-between">
                <span
                    className={`
            inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
            ${sensor.status === 'clear' ? 'bg-emerald-500/20 text-emerald-300 glow-green' :
                            sensor.status === 'warning' ? 'bg-amber-500/20 text-amber-300 glow-yellow' :
                                'bg-red-500/20 text-red-300 glow-red'}
          `}
                >
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${sensor.status === 'clear' ? 'bg-emerald-400' :
                            sensor.status === 'warning' ? 'bg-amber-400' : 'bg-red-400 blink'
                        }`} />
                    {statusDetails.label}
                </span>
                <span className="text-xs text-slate-500">
                    {formatTime(sensor.lastUpdate)}
                </span>
            </div>
        </div>
    );
};

export default SensorCard;
