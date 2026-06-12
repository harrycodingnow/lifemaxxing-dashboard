// Weather via Open-Meteo (free, no API key). Geocodes a place name, then fetches
// current conditions + a multi-day forecast. WMO weather codes are mapped to a
// label + emoji for display.

export type WeatherDay = {
  date: string;
  code: number;
  label: string;
  emoji: string;
  t_max: number;
  t_min: number;
  precip_prob: number | null;
};
export type Weather = {
  location: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    temp: number;
    feels_like: number;
    code: number;
    label: string;
    emoji: string;
    humidity: number | null;
    wind: number | null;
    is_day: boolean;
  };
  daily: WeatherDay[];
};

// WMO weather interpretation codes → [label, day emoji, night emoji].
const WMO: Record<number, [string, string, string]> = {
  0: ["Clear", "☀️", "🌙"],
  1: ["Mainly clear", "🌤️", "🌙"],
  2: ["Partly cloudy", "⛅", "☁️"],
  3: ["Overcast", "☁️", "☁️"],
  45: ["Fog", "🌫️", "🌫️"],
  48: ["Rime fog", "🌫️", "🌫️"],
  51: ["Light drizzle", "🌦️", "🌧️"],
  53: ["Drizzle", "🌦️", "🌧️"],
  55: ["Heavy drizzle", "🌧️", "🌧️"],
  56: ["Freezing drizzle", "🌧️", "🌧️"],
  57: ["Freezing drizzle", "🌧️", "🌧️"],
  61: ["Light rain", "🌦️", "🌧️"],
  63: ["Rain", "🌧️", "🌧️"],
  65: ["Heavy rain", "🌧️", "🌧️"],
  66: ["Freezing rain", "🌧️", "🌧️"],
  67: ["Freezing rain", "🌧️", "🌧️"],
  71: ["Light snow", "🌨️", "🌨️"],
  73: ["Snow", "🌨️", "🌨️"],
  75: ["Heavy snow", "❄️", "❄️"],
  77: ["Snow grains", "🌨️", "🌨️"],
  80: ["Light showers", "🌦️", "🌧️"],
  81: ["Showers", "🌧️", "🌧️"],
  82: ["Violent showers", "⛈️", "⛈️"],
  85: ["Snow showers", "🌨️", "🌨️"],
  86: ["Snow showers", "❄️", "❄️"],
  95: ["Thunderstorm", "⛈️", "⛈️"],
  96: ["Thunderstorm + hail", "⛈️", "⛈️"],
  99: ["Thunderstorm + hail", "⛈️", "⛈️"],
};

export function describeCode(code: number, isDay = true): { label: string; emoji: string } {
  const entry = WMO[code] ?? ["Unknown", "❓", "❓"];
  return { label: entry[0], emoji: isDay ? entry[1] : entry[2] };
}

type GeoResult = { name: string; country?: string; admin1?: string; latitude: number; longitude: number; timezone?: string };

export async function geocode(place: string): Promise<GeoResult | null> {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) throw new Error(`geocode failed: ${r.status}`);
  const j = await r.json();
  const res = j?.results?.[0];
  return res ?? null;
}

export async function getWeather(place: string): Promise<Weather> {
  const geo = await geocode(place);
  if (!geo) throw new Error(`location not found: ${place}`);

  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "5",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`forecast failed: ${r.status}`);
  const j = await r.json();
  const c = j.current;
  const isDay = c.is_day === 1;
  const cur = describeCode(c.weather_code, isDay);

  const daily: WeatherDay[] = (j.daily?.time ?? []).map((date: string, i: number) => {
    const code = j.daily.weather_code[i];
    const d = describeCode(code, true);
    return {
      date,
      code,
      label: d.label,
      emoji: d.emoji,
      t_max: Math.round(j.daily.temperature_2m_max[i]),
      t_min: Math.round(j.daily.temperature_2m_min[i]),
      precip_prob: j.daily.precipitation_probability_max?.[i] ?? null,
    };
  });

  const locName = [geo.name, geo.admin1 && geo.admin1 !== geo.name ? null : null].filter(Boolean).join(", ") || geo.name;

  return {
    location: geo.country && geo.country !== geo.name ? `${locName}, ${geo.country}` : locName,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: j.timezone ?? geo.timezone ?? "auto",
    current: {
      temp: Math.round(c.temperature_2m),
      feels_like: Math.round(c.apparent_temperature),
      code: c.weather_code,
      label: cur.label,
      emoji: cur.emoji,
      humidity: c.relative_humidity_2m ?? null,
      wind: c.wind_speed_10m ?? null,
      is_day: isDay,
    },
    daily,
  };
}
