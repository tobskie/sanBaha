/**
 * Weather service for sanBaha — fetches real-time weather data from Open-Meteo.
 *
 * Open-Meteo is free, requires no API key, and provides accurate hourly
 * rainfall data and forecasts. PAGASA has no public REST API, so Open-Meteo
 * is the practical choice for a real-time system.
 *
 * Results are cached in memory with a 10-minute TTL.  Multiple callers
 * within the window share the same response — only 1 fetch per 10 minutes.
 */

// Lipa City coordinates
const LIPA_LAT = 13.9411;
const LIPA_LNG = 121.1631;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const API_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LIPA_LAT}&longitude=${LIPA_LNG}` +
  `&current=precipitation,rain,weather_code,temperature_2m,relative_humidity_2m,wind_speed_10m` +
  `&hourly=precipitation,precipitation_probability,rain` +
  `&timezone=Asia/Manila` +
  `&forecast_days=1`;

// ── WMO Weather Code → human label ─────────────────────────────────────
const WMO_DESCRIPTIONS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

// ── WMO code → emoji icon ──────────────────────────────────────────────
const WMO_ICONS = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

/** Convert WMO code to human text */
export function getWeatherDescription(code) {
  return WMO_DESCRIPTIONS[code] ?? 'Unknown';
}

/** Convert WMO code to emoji */
export function getWeatherIcon(code) {
  return WMO_ICONS[code] ?? '🌡️';
}

// ── Cache ───────────────────────────────────────────────────────────────
let cachedWeather = null;
let cacheTimestamp = 0;

/**
 * Fetch current weather + hourly forecast for Lipa City.
 *
 * Returns a normalised object:
 * ```
 * {
 *   current: { temp, humidity, wind, rain, weatherCode, description, icon },
 *   hourly:  { time[], precipitation[], precipitationProbability[] },
 *   rainForecast3h: <mm total in next 3 hours>,
 *   isRaining: <boolean — active rain OR heavy rain forecast>,
 *   fetchedAt: <ISO string>
 * }
 * ```
 */
export async function fetchWeather() {
  const now = Date.now();

  // Return cached if fresh
  if (cachedWeather && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedWeather;
  }

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json();

    // ── Parse current conditions ────────────────────────────────────────
    const c = data.current;
    const current = {
      temp: c.temperature_2m,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      rain: c.precipitation,
      weatherCode: c.weather_code,
      description: getWeatherDescription(c.weather_code),
      icon: getWeatherIcon(c.weather_code),
    };

    // ── Parse hourly forecast ───────────────────────────────────────────
    const h = data.hourly;
    const hourly = {
      time: h.time,
      precipitation: h.precipitation,
      precipitationProbability: h.precipitation_probability,
    };

    // ── Compute 3-hour rainfall forecast ────────────────────────────────
    const nowISO = new Date().toISOString().slice(0, 13); // "2026-04-10T17"
    const nowIndex = h.time.findIndex((t) => t >= nowISO);
    const start = nowIndex >= 0 ? nowIndex : 0;
    const end = Math.min(start + 3, h.precipitation.length);
    let rainForecast3h = 0;
    for (let i = start; i < end; i++) {
      rainForecast3h += h.precipitation[i];
    }
    rainForecast3h = Math.round(rainForecast3h * 100) / 100;

    const result = {
      current,
      hourly,
      rainForecast3h,
      isRaining: isRainfallActive({ current, rainForecast3h }),
      fetchedAt: new Date().toISOString(),
    };

    cachedWeather = result;
    cacheTimestamp = now;
    return result;
  } catch (err) {
    console.error('Weather fetch error:', err);
    // Return stale cache if available, otherwise null
    return cachedWeather ?? null;
  }
}

// ── Rain threshold for activating historical zones ─────────────────────
const RAIN_ACTIVE_THRESHOLD_MM = 0;     // any current precipitation counts
const RAIN_FORECAST_THRESHOLD_MM = 5;   // 5mm in next 3 hours

/**
 * Determine if rainfall is active or imminent.
 *
 * Returns `true` when:
 *  - Current precipitation > 0 mm, OR
 *  - Forecasted rain in next 3 hours > 5 mm
 *
 * Used by the routing engine to decide whether to merge historical flood
 * zones into the avoidance set.
 */
export function isRainfallActive(weather) {
  if (!weather) return false;
  const currentRain = weather.current?.rain ?? 0;
  const forecast = weather.rainForecast3h ?? 0;
  return currentRain > RAIN_ACTIVE_THRESHOLD_MM || forecast > RAIN_FORECAST_THRESHOLD_MM;
}
