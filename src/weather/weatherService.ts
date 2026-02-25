import { invoke } from "@tauri-apps/api/core";
import { log } from "../utils/log";
import type { LocationConfig, WeatherData, WeatherOverlay } from "./types";

const WEATHER_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedLocation: LocationConfig | null = null;
let cachedWeather: WeatherData | null = null;
let locationFetchInFlight: Promise<LocationConfig | null> | null = null;

/** Fetch approximate location from IP geolocation (via Rust backend to avoid CSP issues) */
export async function fetchLocation(): Promise<LocationConfig | null> {
  if (cachedLocation) return cachedLocation;
  if (locationFetchInFlight) return locationFetchInFlight;
  locationFetchInFlight = (async () => {
    try {
      const data = await invoke<Record<string, unknown>>("fetch_location");
      cachedLocation = {
        lat: data.latitude as number,
        lon: data.longitude as number,
        city: data.city as string | undefined,
        source: "ip",
      };
      log.info("Location:", cachedLocation.city, cachedLocation.lat, cachedLocation.lon);
      return cachedLocation;
    } catch (e) {
      log.error("Failed to fetch location:", e);
      return null;
    } finally {
      locationFetchInFlight = null;
    }
  })();
  return locationFetchInFlight;
}

/** Set manual location override */
export function setManualLocation(lat: number, lon: number, city?: string) {
  cachedLocation = { lat, lon, city, source: "manual" };
  cachedWeather = null; // force re-fetch with new location
}

export function getLocation(): LocationConfig | null {
  return cachedLocation;
}

/** Fetch weather data from Open-Meteo (via Rust backend to avoid CSP issues) */
export async function fetchWeather(location: LocationConfig): Promise<WeatherData | null> {
  // Return cache if fresh
  if (cachedWeather && Date.now() - cachedWeather.fetchedAt < WEATHER_CACHE_MS) {
    return cachedWeather;
  }

  try {
    const data = await invoke<Record<string, unknown>>("fetch_weather", {
      lat: location.lat,
      lon: location.lon,
    });

    const now = new Date();
    const currentHour = now.getHours();

    const hourly = data.hourly as Record<string, number[]> | undefined;
    const daily = data.daily as Record<string, string[]> | undefined;

    const weather: WeatherData = {
      weatherCode: hourly?.weathercode?.[currentHour] ?? 0,
      cloudCover: hourly?.cloudcover?.[currentHour] ?? 0,
      precipitation: hourly?.precipitation?.[currentHour] ?? 0,
      temperature: hourly?.temperature_2m?.[currentHour] ?? 20,
      sunrise: daily?.sunrise?.[0] ?? "",
      sunset: daily?.sunset?.[0] ?? "",
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
