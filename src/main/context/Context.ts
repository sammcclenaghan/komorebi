/**
 * Context assembly for the composer prompt. Currently one always-on source:
 * today's weather, derived from the timezone's city (Open-Meteo, no key).
 * Context is best-effort by design — a failure yields fewer blocks, never a
 * failed generation. New sources plug in here.
 */
import { Effect } from "effect";
import { Weather } from "../weather/Weather";
import type { ContextBlock } from "./types";

export class Context extends Effect.Service<Context>()("Context", {
  dependencies: [Weather.Default],
  effect: Effect.gen(function* () {
    const weather = yield* Weather;

    const weatherBlock = (): Effect.Effect<ContextBlock | null> =>
      Effect.gen(function* () {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "";
        if (!city) return null;

        const w = yield* weather.current(city);
        if (!w) return null;

        // The *day's* shape, not the moment of generation — a checklist
        // composed at 7am full of "great for tonight" ideas reads wrong.
        const d = w.daily;
        const parts: string[] = [
          `${w.resolvedName} today: ${d.description.toLowerCase()}, high ${d.tempMaxC}°C / low ${d.tempMinC}°C.`
        ];
        if (d.precipitationProbabilityPct >= 30) {
          parts.push(
            `${d.precipitationProbabilityPct}% chance of precipitation (~${d.precipitationMm}mm).`
          );
        }
        return { label: "Weather", source: "weather", body: parts.join(" ") };
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

    const build = (): Effect.Effect<ContextBlock[]> =>
      weatherBlock().pipe(Effect.map((block) => (block ? [block] : [])));

    return { build } as const;
  })
}) {}
