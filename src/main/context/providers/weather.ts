import { getCurrentWeather } from "../../weather/service";

/**
 * Daily weather summary for Claude. Critically: the *day's* shape, not the
 * moment of generation. Otherwise a checklist composed at 7am full of "great
 * for tonight" suggestions arrives at the user's evening read.
 */
export async function fetchWeatherContext(location: string): Promise<string | null> {
  const w = await getCurrentWeather(location);
  if (!w) return null;

  const d = w.daily;
  const parts: string[] = [
    `${w.resolvedName} today: ${d.description.toLowerCase()}, high ${d.tempMaxC}°C / low ${d.tempMinC}°C.`
  ];
  if (d.precipitationProbabilityPct >= 30) {
    parts.push(
      `${d.precipitationProbabilityPct}% chance of precipitation (~${d.precipitationMm}mm).`
    );
  }
  return parts.join(" ");
}
