/**
 * Current-weather lookup via Composio's WEATHERMAP_WEATHER tool.
 * The toolkit is NO_AUTH — no API key or OAuth connection required.
 *
 * OpenWeatherMap always returns Kelvin regardless of the units param we
 * pass, so we convert ourselves. The icon code (e.g. "04d") tells us day
 * vs night.
 */
import { Composio } from "@composio/core";
import { getUserId } from "../integrations/composio";

export type WeatherCondition =
  | "clear"
  | "clouds"
  | "rain"
  | "drizzle"
  | "snow"
  | "thunderstorm"
  | "mist"
  | "unknown";

export type WeatherSummary = {
  /** Normalized condition we can switch on for icons. */
  condition: WeatherCondition;
  /** OpenWeatherMap's free-text description, e.g. "broken clouds". */
  description: string;
  /** Temperature in Celsius, rounded. */
  temperatureC: number;
  /** True if the OWM icon code ends in 'n'. */
  isNight: boolean;
  /** The resolved city/region name from OpenWeatherMap. */
  resolvedName: string;
};

type CacheEntry = { value: WeatherSummary | null; at: number };
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function client(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
  return new Composio({ apiKey });
}

function normalizeCondition(main: string): WeatherCondition {
  switch (main.toLowerCase()) {
    case "clear":
      return "clear";
    case "clouds":
      return "clouds";
    case "rain":
      return "rain";
    case "drizzle":
      return "drizzle";
    case "snow":
      return "snow";
    case "thunderstorm":
      return "thunderstorm";
    case "mist":
    case "fog":
    case "haze":
    case "smoke":
    case "dust":
    case "sand":
    case "ash":
    case "squall":
    case "tornado":
      return "mist";
    default:
      return "unknown";
  }
}

export async function getCurrentWeather(location: string): Promise<WeatherSummary | null> {
  const key = location.trim().toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const composio = client();
    const result = await composio.tools.execute("WEATHERMAP_WEATHER", {
      userId: getUserId(),
      arguments: { location, units: "metric" },
      dangerouslySkipVersionCheck: true
    });

    if (!result.successful) {
      console.error(`[weather] tool error: ${result.error}`);
      cache.set(key, { value: null, at: Date.now() });
      return null;
    }

    const data = result.data as Record<string, unknown>;
    const info = (data.weather_info as Record<string, unknown> | undefined) ?? data;
    const weatherArr = info.weather as Array<Record<string, unknown>> | undefined;
    const w = weatherArr?.[0];
    const main = (info.main as Record<string, number> | undefined) ?? undefined;

    if (!w || !main || typeof main.temp !== "number") {
      cache.set(key, { value: null, at: Date.now() });
      return null;
    }

    const tempK = main.temp;
    const summary: WeatherSummary = {
      condition: normalizeCondition(String(w.main ?? "")),
      description: String(w.description ?? ""),
      temperatureC: Math.round(tempK - 273.15),
      isNight: String(w.icon ?? "").endsWith("n"),
      resolvedName: String(info.name ?? location)
    };

    cache.set(key, { value: summary, at: Date.now() });
    return summary;
  } catch (err) {
    console.error("[weather] failed:", err);
    cache.set(key, { value: null, at: Date.now() });
    return null;
  }
}
