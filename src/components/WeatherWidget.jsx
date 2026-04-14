import { useState, useEffect } from 'react';
import { fetchWeather } from '../services/weatherService';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Compact weather widget for the map overlay.
 * Shows current conditions + 3-hour rain forecast for Lipa City.
 *
 * Props:
 *   onWeatherUpdate(weather) — called whenever fresh data arrives;
 *                               App.jsx uses this to store weatherData in state.
 */
const WeatherWidget = ({ onWeatherUpdate }) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const data = await fetchWeather();
      if (mounted && data) {
        setWeather(data);
        setLoading(false);
        onWeatherUpdate?.(data);
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [onWeatherUpdate]);

  if (loading || !weather) {
    return (
      <div className="glass rounded-xl px-3 py-1.5 flex items-center gap-2 animate-pulse">
        <span className="text-[10px] text-slate-400">Loading weather…</span>
      </div>
    );
  }

  const { current, rainForecast3h, isRaining } = weather;

  return (
    <div className="glass rounded-xl px-3 py-1.5 flex flex-col gap-0.5 min-w-[180px]">
      {/* Row 1: Current conditions */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-base leading-none">{current.icon}</span>
        <span className="text-white font-semibold">{current.temp}°C</span>
        <span className="text-slate-400">💧{current.humidity}%</span>
        {current.rain > 0 && (
          <span className="text-[#00d4ff] font-medium">
            🌧 {current.rain}mm
          </span>
        )}
      </div>

      {/* Row 2: Forecast + source */}
      <div className="flex items-center gap-1.5 text-[9px]">
        {rainForecast3h > 0 ? (
          <span className={`font-medium ${rainForecast3h > 5 ? 'text-amber-400' : 'text-slate-300'}`}>
            Rain 3h: {rainForecast3h}mm
            {rainForecast3h > 5 && ' ⚠'}
          </span>
        ) : (
          <span className="text-slate-500">No rain expected</span>
        )}
        <span className="text-slate-600">·</span>
        <span className="text-slate-500">
          {isRaining && (
            <span className="text-amber-400 mr-1">🕐 Hist. zones active</span>
          )}
        </span>
        <span className="text-[#00d4ff]/50 ml-auto">Open-Meteo</span>
      </div>
    </div>
  );
};

export default WeatherWidget;
