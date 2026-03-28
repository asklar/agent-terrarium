export interface LocationConfig {
  lat: number;
  lon: number;
  city?: string;
  source: "ip" | "manual";
}

export interface WeatherData {
  /** WMO weather code for current hour */
  weatherCode: number;
  /** Cloud cover 0-100% */
  cloudCover: number;
  /** Precipitation mm/h */
  precipitation: number;
  /** Temperature °C */
  temperature: number;
  /** Today's sunrise ISO string */
  sunrise: string;
  /** Today's sunset ISO string */
  sunset: string;
  /** When this data was fetched */
  fetchedAt: number;
}

export interface SkyState {
  /** Sky gradient stops (top to bottom) */
  skyColors: string[];
  /** Sun position 0-1 across the arc (0=east horizon, 0.5=zenith, 1=west horizon), or null if below horizon */
  sunPosition: number | null;
  /** Sun opacity (fades at horizon) */
  sunOpacity: number;
  /** Moon position 0-1 across the arc, or null if below horizon */
  moonPosition: number | null;
  /** Moon opacity */
  moonOpacity: number;
  /** Star opacity 0-1 */
  starOpacity: number;
  /** Ground tint color (darker at night, warmer at sunset) */
  groundTint: string;
  /** Ground tint opacity 0-1 */
  groundTintOpacity: number;
  /** Weather overlay type */
  weatherOverlay: WeatherOverlay;
  /** Weather overlay intensity 0-1 */
  weatherIntensity: number;
  /** Overall sky brightness 0-1 (for dimming) */
  brightness: number;
}

export type WeatherOverlay = "none" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Time-of-day period for sky calculation */
export type DayPeriod = "night" | "dawn" | "morning" | "noon" | "afternoon" | "dusk";

export interface DynamicMeadowState {
  location: LocationConfig | null;
  weather: WeatherData | null;
  /** Current rendered sky state (interpolated) */
  currentSky: SkyState;
  /** Target sky state (computed from time + weather) */
  targetSky: SkyState;
  /** Debug overrides */
  debugTime: number | null; // epoch ms, null = use real time
  debugWeather: WeatherOverlay | null; // null = use real weather
}

export const DEFAULT_SKY: SkyState = {
  skyColors: ["#87CEEB", "#B4E4FF", "#E8F5E9"],
  sunPosition: 0.5,
  sunOpacity: 1,
  moonPosition: null,
  moonOpacity: 0,
  starOpacity: 0,
  groundTint: "rgba(0,0,0,0)",
  groundTintOpacity: 0,
  weatherOverlay: "none",
  weatherIntensity: 0,
  brightness: 1,
};
