/**
 * Weather lookup via Open-Meteo (https://open-meteo.com). Free, no API key.
 * One call gives current conditions (header icon + tooltip) AND a daily
 * summary (max/min temp, precipitation, dominant condition) — the day's
 * shape, which is what the suggestion composer actually needs.
 *
 * Failures resolve to `null` (the UI simply hides the weather chip); results
 * are cached for 30 minutes per location.
 */
import { Effect, Ref } from "effect";
import type { WeatherCondition, WeatherSummary } from "~/shared/schema";

const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { value: WeatherSummary | null; at: number };

function describeWmo(code: number): { condition: WeatherCondition; description: string } {
  // https://open-meteo.com/en/docs (WMO weather codes)
  if (code === 0) return { condition: "clear", description: "Clear sky" };
  if (code === 1) return { condition: "clear", description: "Mostly clear" };
  if (code === 2) return { condition: "clouds", description: "Partly cloudy" };
  if (code === 3) return { condition: "clouds", description: "Overcast" };
  if (code === 45 || code === 48) return { condition: "mist", description: "Foggy" };
  if (code >= 51 && code <= 57) return { condition: "drizzle", description: "Drizzle" };
  if (code >= 61 && code <= 67) return { condition: "rain", description: "Rain" };
  if (code >= 71 && code <= 77) return { condition: "snow", description: "Snow" };
  if (code >= 80 && code <= 82) return { condition: "rain", description: "Rain showers" };
  if (code === 85 || code === 86) return { condition: "snow", description: "Snow showers" };
  if (code >= 95 && code <= 99) return { condition: "thunderstorm", description: "Thunderstorm" };
  return { condition: "unknown", description: "Unknown" };
}

type Geocoded = { lat: number; lon: number; name: string; country: string | null };

async function geocode(query: string): Promise<Geocoded | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const top = data.results?.[0];
  if (!top) return null;
  return {
    lat: Number(top.latitude),
    lon: Number(top.longitude),
    name: String(top.name ?? query),
    country: typeof top.country_code === "string" ? (top.country_code as string) : null
  };
}

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
  };
};

async function fetchForecast(lat: number, lon: number): Promise<ForecastResponse | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum"
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as ForecastResponse;
}

async function lookup(location: string): Promise<WeatherSummary | null> {
  const place = await geocode(location);
  if (!place) return null;

  const forecast = await fetchForecast(place.lat, place.lon);
  const current = forecast?.current;
  const daily = forecast?.daily;
  if (!current || !daily) return null;

  const currentInfo = describeWmo(current.weather_code ?? -1);
  const dailyInfo = describeWmo(daily.weather_code?.[0] ?? -1);

  return {
    condition: currentInfo.condition,
    description: currentInfo.description,
    temperatureC: Math.round(current.temperature_2m ?? 0),
    isNight: current.is_day === 0,
    resolvedName: place.country ? `${place.name}, ${place.country}` : place.name,
    daily: {
      condition: dailyInfo.condition,
      description: dailyInfo.description,
      tempMaxC: Math.round(daily.temperature_2m_max?.[0] ?? 0),
      tempMinC: Math.round(daily.temperature_2m_min?.[0] ?? 0),
      precipitationProbabilityPct: Math.round(daily.precipitation_probability_max?.[0] ?? 0),
      precipitationMm: Math.round((daily.precipitation_sum?.[0] ?? 0) * 10) / 10
    }
  };
}

export class Weather extends Effect.Service<Weather>()("Weather", {
  effect: Effect.gen(function* () {
    const cache = yield* Ref.make(new Map<string, CacheEntry>());

    const current = (location: string): Effect.Effect<WeatherSummary | null> =>
      Effect.gen(function* () {
        const key = location.trim().toLowerCase();
        if (!key) return null;

        const entries = yield* Ref.get(cache);
        const cached = entries.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

        const value = yield* Effect.tryPromise(() => lookup(location)).pipe(
          Effect.catchAll((err) =>
            Effect.logWarning(`weather lookup failed: ${err}`).pipe(Effect.as(null))
          )
        );

        yield* Ref.update(cache, (m) => {
          const next = new Map(m);
          next.set(key, { value, at: Date.now() });
          return next;
        });
        return value;
      });

    return { current } as const;
  })
}) {}
