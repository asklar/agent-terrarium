import type { SkyState, WeatherData, WeatherOverlay, DayPeriod } from "./types";
import { weatherCodeToOverlay } from "./weatherService";

// Sky color palettes for each period
const SKY_PALETTES: Record<DayPeriod, string[]> = {
  night:     ["#0a0e2a", "#111b3d", "#1a2550"],
  dawn:      ["#2d1b4e", "#8b4585", "#e88d67", "#ffd3a5"],
  morning:   ["#4a90d9", "#87CEEB", "#B4E4FF"],
  noon:      ["#3a85d6", "#67b8f0", "#9dd4f5"],
  afternoon: ["#5a9bd5", "#87CEEB", "#c0dff0"],
  dusk:      ["#2d1b4e", "#c0506e", "#e8945a", "#ffc87a"],
};

// Weather tint: blended over the time-of-day sky colors
const WEATHER_SKY_TINTS: Partial<Record<WeatherOverlay, { colors: string[]; strength: number }>> = {
  cloudy: { colors: ["#8a8a9a", "#9a9aaa", "#a8a8b8"], strength: 0.3 },
  fog:    { colors: ["#9a9aaa", "#a8a8b8", "#b8b8c8"], strength: 0.45 },
  drizzle:{ colors: ["#707888", "#808898", "#909aa8"], strength: 0.35 },
  rain:   { colors: ["#505868", "#607080", "#708090"], strength: 0.5 },
  snow:   { colors: ["#8090a0", "#90a0b0", "#a8b4c0"], strength: 0.35 },
  storm:  { colors: ["#2a3040", "#3a4555", "#4a5565"], strength: 0.7 },
};

const GROUND_TINTS: Record<DayPeriod, [string, number]> = {
  night:     ["#0a0e2a", 0.35],
  dawn:      ["#e88d67", 0.12],
  morning:   ["#000000", 0],
  noon:      ["#000000", 0],
  afternoon: ["#d4a055", 0.05],
  dusk:      ["#c0506e", 0.15],
};

const BRIGHTNESS: Record<DayPeriod, number> = {
  night: 0.3,
  dawn: 0.6,
  morning: 0.95,
  noon: 1.0,
  afternoon: 0.95,
  dusk: 0.6,
};

// Weather reduces brightness too
const WEATHER_BRIGHTNESS_FACTOR: Partial<Record<WeatherOverlay, number>> = {
  cloudy: 0.9,
  fog: 0.85,
  drizzle: 0.85,
  rain: 0.75,
  snow: 0.85,
  storm: 0.55,
};

/** Parse an ISO time string (from Open-Meteo) to epoch ms */
function parseTime(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Compute day period boundaries dynamically from sunrise/sunset.
 * Dawn and dusk scale proportionally to day/night length rather
 * than using fixed minute offsets.
 */
function computeBoundaries(sunrise: number, sunset: number) {
  const dayLen = sunset - sunrise;
  const nightLen = 24 * 60 * 60 * 1000 - dayLen;

  // Dawn: starts 1/8 of night before sunrise, ends 1/12 of day after sunrise
  const dawnStart = sunrise - nightLen * 0.125;
  const dawnEnd = sunrise + dayLen * (1 / 12);

  // Noon: centered at solar noon, spans 1/6 of day length
  const solarNoon = (sunrise + sunset) / 2;
  const noonHalf = dayLen * (1 / 12);
  const noonStart = solarNoon - noonHalf;
  const noonEnd = solarNoon + noonHalf;

  // Dusk: starts 1/12 of day before sunset, ends 1/6 of night after sunset
  const duskStart = sunset - dayLen * (1 / 12);
  const duskEnd = sunset + nightLen * (1 / 6);

  return { dawnStart, dawnEnd, noonStart, noonEnd, duskStart, duskEnd };
}

/** Get the current day period from sun times */
export function getDayPeriod(now: number, sunrise: number, sunset: number): DayPeriod {
  const { dawnStart, dawnEnd, noonStart, noonEnd, duskStart, duskEnd } = computeBoundaries(sunrise, sunset);

  if (now < dawnStart || now > duskEnd) return "night";
  if (now < dawnEnd) return "dawn";
  if (now < noonStart) return "morning";
  if (now < noonEnd) return "noon";
  if (now < duskStart) return "afternoon";
  return "dusk";
}

/** Get interpolation factor between two periods (0-1) */
function getPeriodBlend(now: number, sunrise: number, sunset: number): { period: DayPeriod; nextPeriod: DayPeriod; blend: number } {
  const { dawnStart, dawnEnd, noonStart, noonEnd, duskStart, duskEnd } = computeBoundaries(sunrise, sunset);

  const dayLen = sunset - sunrise;
  // Transition durations scale with day length
  const shortTransition = dayLen * (1 / 24);  // ~30min for a 12h day
  const medTransition = dayLen * (1 / 16);    // ~45min for a 12h day

  const transitions: [number, number, DayPeriod, DayPeriod][] = [
    [dawnStart, dawnEnd, "night", "dawn"],
    [dawnEnd, dawnEnd + shortTransition, "dawn", "morning"],
    [noonStart - medTransition, noonStart, "morning", "noon"],
    [noonEnd, noonEnd + medTransition, "noon", "afternoon"],
    [duskStart - shortTransition, duskStart, "afternoon", "dusk"],
    [duskEnd - medTransition, duskEnd, "dusk", "night"],
  ];

  for (const [start, end, from, to] of transitions) {
    if (now >= start && now <= end) {
      const t = Math.max(0, Math.min(1, (now - start) / (end - start)));
      return { period: from, nextPeriod: to, blend: t };
    }
  }

  const period = getDayPeriod(now, sunrise, sunset);
  return { period, nextPeriod: period, blend: 0 };
}

/** Compute sun position (0=east, 0.5=zenith, 1=west) */
function getSunPosition(now: number, sunrise: number, sunset: number): number | null {
  if (now < sunrise || now > sunset) return null;
  return (now - sunrise) / (sunset - sunrise);
}

/** Compute moon position (simple: opposite of sun schedule) */
function getMoonPosition(now: number, sunrise: number, sunset: number): number | null {
  const nightDuration = sunrise + 24 * 60 * 60 * 1000 - sunset;
  if (now > sunset) {
    const elapsed = now - sunset;
    if (elapsed > nightDuration) return null;
    return elapsed / nightDuration;
  }
  if (now < sunrise) {
    const elapsed = now + 24 * 60 * 60 * 1000 - sunset;
    if (elapsed > nightDuration) return null;
    return elapsed / nightDuration;
  }
  return null;
}

/** Interpolate hex colors */
function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Blend two sky color arrays */
function blendSkyColors(a: string[], b: string[], t: number): string[] {
  const maxLen = Math.max(a.length, b.length);
  const result: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const ca = a[Math.min(i, a.length - 1)];
    const cb = b[Math.min(i, b.length - 1)];
    result.push(lerpColor(ca, cb, t));
  }
  return result;
}

/** Compute the target sky state from time + weather */
export function computeTargetSky(
  now: number,
  weather: WeatherData | null,
  debugTime: number | null,
  debugWeather: WeatherOverlay | null,
): SkyState {
  const effectiveTime = debugTime ?? now;

  // Default sunrise/sunset if no weather data
  const today = new Date(effectiveTime);
  const defaultSunrise = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 30).getTime();
  const defaultSunset = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0).getTime();

  const sunrise = weather?.sunrise ? parseTime(weather.sunrise) : defaultSunrise;
  const sunset = weather?.sunset ? parseTime(weather.sunset) : defaultSunset;

  const { period, nextPeriod, blend } = getPeriodBlend(effectiveTime, sunrise, sunset);

  // Blend time-of-day sky colors
  let skyColors = blendSkyColors(
    SKY_PALETTES[period],
    SKY_PALETTES[nextPeriod],
    blend,
  );

  // Weather
  const weatherOverlay = debugWeather ?? (weather ? weatherCodeToOverlay(weather.weatherCode) : "none");
  const weatherIntensity = weatherOverlay === "none" ? 0 :
    weatherOverlay === "storm" ? 1.0 :
    weatherOverlay === "rain" ? 0.7 :
    weatherOverlay === "snow" ? 0.6 :
    weatherOverlay === "fog" ? 0.5 :
    weatherOverlay === "drizzle" ? 0.4 :
    0.3; // cloudy

  // Tint sky colors based on weather
  const weatherTint = WEATHER_SKY_TINTS[weatherOverlay];
  if (weatherTint) {
    skyColors = blendSkyColors(skyColors, weatherTint.colors, weatherTint.strength * weatherIntensity);
  }

  // Sun & moon
  const sunPos = getSunPosition(effectiveTime, sunrise, sunset);
  const moonPos = getMoonPosition(effectiveTime, sunrise, sunset);

  // Sun opacity (fade near horizon)
  let sunOpacity = 0;
  if (sunPos !== null) {
    const horizonDist = Math.min(sunPos, 1 - sunPos);
    sunOpacity = Math.min(1, horizonDist * 5);
  }

  // Moon opacity
  let moonOpacity = 0;
  if (moonPos !== null) {
    const horizonDist = Math.min(moonPos, 1 - moonPos);
    moonOpacity = Math.min(1, horizonDist * 4);
  }

  // Stars
  const starOpacity = lerp(
    period === "night" ? 1 : period === "dawn" || period === "dusk" ? 0.3 : 0,
    nextPeriod === "night" ? 1 : nextPeriod === "dawn" || nextPeriod === "dusk" ? 0.3 : 0,
    blend,
  );

  // Ground tint
  const [tintA, opA] = GROUND_TINTS[period];
  const [tintB, opB] = GROUND_TINTS[nextPeriod];
  const groundTint = lerpColor(tintA, tintB, blend);
  const groundTintOpacity = lerp(opA, opB, blend);

  // Brightness (time-of-day, then reduced by weather)
  let brightness = lerp(BRIGHTNESS[period], BRIGHTNESS[nextPeriod], blend);
  const weatherBrightness = WEATHER_BRIGHTNESS_FACTOR[weatherOverlay];
  if (weatherBrightness !== undefined) {
    brightness *= weatherBrightness;
  }

  // Weather also reduces sun/star visibility
  const weatherDimming = 1 - weatherIntensity * 0.6;

  return {
    skyColors,
    sunPosition: sunPos,
    sunOpacity: sunOpacity * weatherDimming,
    moonPosition: moonPos,
    moonOpacity: moonOpacity * weatherDimming,
    starOpacity: starOpacity * weatherDimming,
    groundTint,
    groundTintOpacity,
    weatherOverlay,
    weatherIntensity,
    brightness,
  };
}

/** Smoothly interpolate current sky toward target */
export function lerpSkyState(current: SkyState, target: SkyState, speed: number): SkyState {
  const t = Math.min(1, speed);
  return {
    skyColors: blendSkyColors(current.skyColors, target.skyColors, t),
    sunPosition: target.sunPosition,
    sunOpacity: lerp(current.sunOpacity, target.sunOpacity, t),
    moonPosition: target.moonPosition,
    moonOpacity: lerp(current.moonOpacity, target.moonOpacity, t),
    starOpacity: lerp(current.starOpacity, target.starOpacity, t),
    groundTint: lerpColor(current.groundTint, target.groundTint, t),
    groundTintOpacity: lerp(current.groundTintOpacity, target.groundTintOpacity, t),
    weatherOverlay: target.weatherOverlay,
    weatherIntensity: lerp(current.weatherIntensity, target.weatherIntensity, t),
    brightness: lerp(current.brightness, target.brightness, t),
  };
}
