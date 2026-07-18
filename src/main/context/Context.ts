/**
 * Context assembly: fan out across every connected integration that has a
 * registered provider, fetch their blocks in parallel, and collect the
 * non-empty ones. Always-on blocks (weather, derived from the timezone's
 * city) run regardless of connections. A failure in any one provider is
 * logged and skipped — context is best-effort by design.
 */
import { Effect } from "effect";
import type { ConnectionSummary } from "~/shared/schema";
import { ComposioClient } from "../integrations/Composio";
import { Weather } from "../weather/Weather";
import { providers } from "./providers";
import type { ContextBlock } from "./types";

const bySlug = new Map(providers.map((p) => [p.toolkitSlug, p]));

export class Context extends Effect.Service<Context>()("Context", {
  dependencies: [ComposioClient.Default, Weather.Default],
  effect: Effect.gen(function* () {
    const composio = yield* ComposioClient;
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
        return { label: "Weather", toolkitSlug: "weathermap", body: parts.join(" ") };
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

    const build = (input: {
      userId: string;
      connections: ConnectionSummary[];
    }): Effect.Effect<ContextBlock[]> =>
      Effect.gen(function* () {
        const connTasks = input.connections.map(
          (conn): Effect.Effect<ContextBlock | null> => {
            const provider = bySlug.get(conn.toolkitSlug);
            if (!provider) return Effect.succeed(null);
            if (conn.status !== "ACTIVE" && !conn.status.toLowerCase().includes("active")) {
              return Effect.succeed(null);
            }
            return provider.fetch(input.userId).pipe(
              Effect.provideService(ComposioClient, composio),
              Effect.map((body) =>
                body ? { label: provider.label, toolkitSlug: conn.toolkitSlug, body } : null
              ),
              Effect.catchAll((err) =>
                Effect.logWarning(`context provider "${conn.toolkitSlug}" failed: ${err.message}`).pipe(
                  Effect.as(null)
                )
              )
            );
          }
        );

        const [alwaysOn, connResults] = yield* Effect.all(
          [
            weatherBlock(),
            Effect.all(connTasks, { concurrency: "unbounded" })
          ],
          { concurrency: 2 }
        );

        return [
          ...(alwaysOn ? [alwaysOn] : []),
          ...connResults.filter((b): b is ContextBlock => b !== null)
        ];
      });

    return { build } as const;
  })
}) {}
