export interface LocationInfo {
  latitude: number;
  longitude: number;
  city: string;
}

export interface WeatherData {
  hourly: {
    time: string[];
    temperature_2m: number[];
    cloudcover: number[];
    precipitation: number[];
    weathercode: number[];
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
}

export async function fetchLocation(): Promise<LocationInfo> {
  const response = await fetch("https://ipwho.is/");
  if (!response.ok) {
    throw new Error(`Location lookup failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    latitude: number;
    longitude: number;
    city: string;
  };
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    city: data.city,
  };
}

export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,cloudcover,precipitation,weathercode` +
    `&daily=sunrise,sunset` +
    `&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }
  return (await response.json()) as WeatherData;
}
