import { useState, useEffect, useCallback } from "react";
import { getCachedWeather, getLocation, weatherCodeToOverlay } from "../weather/weatherService";
import type { WeatherData } from "../weather/types";
import "./WeatherWidget.css";

function weatherDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45) return "Foggy";
  if (code === 48) return "Rime fog";
  if (code >= 51 && code <= 53) return "Drizzle";
  if (code >= 55 && code <= 57) return "Freezing drizzle";
  if (code === 61) return "Light rain";
  if (code === 63) return "Moderate rain";
  if (code === 65) return "Heavy rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71) return "Light snow";
  if (code === 73) return "Moderate snow";
  if (code === 75) return "Heavy snow";
  if (code === 77) return "Snow grains";
  if (code === 80) return "Light showers";
  if (code === 81) return "Moderate showers";
  if (code === 82) return "Violent showers";
  if (code === 85) return "Light snow showers";
  if (code === 86) return "Heavy snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Unknown";
}

function weatherIcon(code: number, isNight: boolean): string {
  const overlay = weatherCodeToOverlay(code);
  if (overlay === "snow") return "\u2744\ufe0f";
  if (overlay === "rain" || overlay === "drizzle") return "\ud83c\udf27\ufe0f";
  if (overlay === "storm") return "\u26c8\ufe0f";
  if (overlay === "fog") return "\ud83c\udf2b\ufe0f";
  if (overlay === "cloudy") return isNight ? "\u2601\ufe0f" : "\u26c5";
  return isNight ? "\ud83c\udf19" : "\u2600\ufe0f";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

export function WeatherWidget() {
  const [open, setOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [city, setCity] = useState<string | undefined>();
  const [now, setNow] = useState(new Date());
  const [useFahrenheit, setUseFahrenheit] = useState(true);

  // Read cached weather data (fetched centrally by App)
  useEffect(() => {
    const update = () => {
      setWeather(getCachedWeather());
      setCity(getLocation()?.city);
      setNow(new Date());
    };
    update();
    const id = setInterval(update, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleUnit = useCallback(() => setUseFahrenheit((f) => !f), []);

  const isNight = weather ? (() => {
    try {
      const sunrise = new Date(weather.sunrise);
      const sunset = new Date(weather.sunset);
      return now < sunrise || now > sunset;
    } catch {
      return false;
    }
  })() : false;

  const icon = weather ? weatherIcon(weather.weatherCode, isNight) : "\u2600\ufe0f";
  const temp = weather ? (useFahrenheit
    ? `${Math.round(celsiusToFahrenheit(weather.temperature))}\u00b0F`
    : `${Math.round(weather.temperature)}\u00b0C`) : "--";

  return (
    <>
      <button
        className="weather-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Weather"
      >
        {icon}
      </button>
      {open && (
        <div className={`weather-panel ${isNight ? "night" : "day"}`}>
          <div className="weather-panel-header">
            <span className="weather-panel-city">{city ?? "Unknown"}</span>
            <span className="weather-panel-time">
              {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          {weather ? (
            <>
              <div className="weather-panel-main">
                <span className="weather-panel-icon">{icon}</span>
                <span className="weather-panel-temp" onClick={toggleUnit} title="Click to toggle \u00b0F/\u00b0C">
                  {temp}
                </span>
              </div>
              <div className="weather-panel-desc">
                {weatherDescription(weather.weatherCode)}
              </div>
              <div className="weather-panel-details">
                <div className="weather-detail">
                  <span className="weather-detail-icon">{"\ud83c\udf05"}</span>
                  <span>{formatTime(weather.sunrise)}</span>
                </div>
                <div className="weather-detail">
                  <span className="weather-detail-icon">{"\ud83c\udf07"}</span>
                  <span>{formatTime(weather.sunset)}</span>
                </div>
                <div className="weather-detail">
                  <span className="weather-detail-icon">{"\ud83d\udca7"}</span>
                  <span>{weather.precipitation > 0 ? `${weather.precipitation} mm/h` : "None"}</span>
                </div>
                <div className="weather-detail">
                  <span className="weather-detail-icon">{"\u2601\ufe0f"}</span>
                  <span>{weather.cloudCover}%</span>
                </div>
              </div>
            </>
          ) : (
            <div className="weather-panel-desc">Loading weather data...</div>
          )}
        </div>
      )}
    </>
  );
}
