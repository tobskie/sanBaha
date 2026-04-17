import { useState, useEffect } from 'react';
import { fetchWeather } from '../services/weatherService';

const POLL_INTERVAL_MS = 10 * 60 * 1000;

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
    return () => { mounted = false; clearInterval(interval); };
  }, [onWeatherUpdate]);

  if (loading || !weather) {
    return (
      <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-slate-600 animate-pulse" />
        <span className="text-xs text-slate-400">Weather…</span>
      </div>
    );
  }

  const { current, rainForecast3h } = weather;

  return (
    <div className="glass rounded-xl px-3 py-2 flex items-center gap-2.5 min-w-0">
      {/* Temp */}
      <div className="flex items-center gap-1.5">
        {/* Thermometer icon */}
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19a3 3 0 106 0 3 3 0 00-6 0zm3-10V5m0 0a2 2 0 100-4 2 2 0 000 4zm0 0v4" />
        </svg>
        <span className="text-xs font-semibold text-white">{current.temp}°C</span>
      </div>

      <span className="text-slate-600 text-xs">·</span>

      {/* Humidity */}
      <div className="flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-[#00d4ff]/70 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span className="text-xs text-slate-400">{current.humidity}%</span>
      </div>

      {/* Rain forecast */}
      {rainForecast3h > 0 ? (
        <>
          <span className="text-slate-600 text-xs">·</span>
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ color: rainForecast3h > 5 ? '#fbbf24' : '#00d4ff' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <span className={`text-xs font-medium ${rainForecast3h > 5 ? 'text-amber-400' : 'text-[#00d4ff]'}`}>
              {rainForecast3h}mm
            </span>
          </div>
        </>
      ) : (
        <>
          <span className="text-slate-600 text-xs">·</span>
          <span className="text-xs text-slate-500">No rain</span>
        </>
      )}

      <span className="text-[10px] text-slate-600 ml-auto pl-1">Open-Meteo</span>
    </div>
  );
};

export default WeatherWidget;
