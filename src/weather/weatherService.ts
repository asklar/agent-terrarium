import { log } from "../utils/log";
import type { LocationConfig, WeatherData, WeatherOverlay } from "./types";

const WEATHER_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedLocation: LocationConfig | null = null;
let cachedWeather: WeatherData | null = null;

/** Fetch approximate location from IP geolocation */
export async function fetchLocation(): Promise<LocationConfig | null> {
  if (cachedLocation) return cachedLocation;
  try {
    // Use HTTPS endpoint (plain HTTP is blocked as mixed content in Tauri's webview)
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedLocation = {
      lat: data.latitude,
      lon: data.longitude,
      city: data.city,
      source: "ip",
    };
    log.info("Location:", cachedLocation.city, cachedLocation.lat, cachedLocation.lon);
    return cachedLocation;
  } catch (e) {
    log.error("Failed to fetch location:", e);
    return null;
  }
}

/** Set manual location override */
export function setManualLocation(lat: number, lon: number, city?: string) {
  cachedLocation = { lat, lon, city, source: "manual" };
  cachedWeather = null; // force re-fetch with new location
}

export function getLocation(): LocationConfig | null {
  return cachedLocation;
}

/** Fetch weather data from Open-Meteo */
export async function fetchWeather(location: LocationConfig): Promise<WeatherData | null> {
  // Return cache if fresh
  if (cachedWeather && Date.now() - cachedWeather.fetchedAt < WEATHER_CACHE_MS) {
    return cachedWeather;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&hourly=temperature_2m,cloudcover,precipitation,weathercode&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const now = new Date();
    const currentHour = now.getHours();

    const weather: WeatherData = {
      weatherCode: data.hourly?.weathercode?.[currentHour] ?? 0,
      cloudCover: data.hourly?.cloudcover?.[currentHour] ?? 0,
      precipitation: data.hourly?.precipitation?.[currentHour] ?? 0,
      temperature: data.hourly?.temperature_2m?.[currentHour] ?? 20,
      sunrise: data.daily?.sunrise?.[0] ?? "",
      sunset: data.daily?.sunset?.[0] ?? "",
      fetchedAt: Date.now(),
    };

    log.info("Weather:", `code=${weather.weatherCode}`, `cloud=${weather.cloudCover}%`,
      `precip=${weather.precipitation}mm`, `sunrise=${weather.sunrise}`, `sunset=${weather.sunset}`);

    cachedWeather = weather;
    return weather;
  } catch (e) {
    log.error("Failed to fetch weather:", e);
    return cachedWeather; // return stale cache if available
  }
}

/** Map WMO weather code to our overlay type */
export function weatherCodeToOverlay(code: number): WeatherOverlay {
  if (code === 0) return "none";               // Clear sky
  if (code <= 3) return "cloudy";              // Mainly clear / partly cloudy / overcast
  if (code === 45 || code === 48) return "fog"; // Fog / rime fog
  if (code >= 51 && code <= 57) return "drizzle"; // Drizzle (light → dense, incl. freezing)
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"; // Rain + rain showers
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"; // Snow + snow showers
  if (code >= 95) return "storm";              // Thunderstorm (with/without hail)
  return "cloudy";
}

/** Get cached weather without fetching */
export function getCachedWeather(): WeatherData | null {
  return cachedWeather;
}
