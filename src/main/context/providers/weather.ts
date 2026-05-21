import { getCurrentWeather } from "../../weather/service";

/**
 * Always-on weather context. Unlike Composio-toolkit-backed providers,
 * this doesn't need an explicit user connection — the underlying
 * WEATHERMAP_WEATHER tool is NO_AUTH.
 *
 * Returns a one-line markdown block like:
 *   "Toronto: partly cloudy, 9°C (night)."
 * or null if no usable location was provided or the lookup failed.
 */
export async function fetchWeatherContext(location: string): Promise<string | null> {
  const w = await getCurrentWeather(location);
  if (!w) return null;
  const timeOfDay = w.isNight ? " (night)" : "";
  return `${w.resolvedName}: ${w.description}, ${w.temperatureC}°C${timeOfDay}.`;
}
