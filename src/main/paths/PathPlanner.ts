import { randomUUID } from "node:crypto";
import { Effect, Schema } from "effect";
import { PathPlanDraftSchema, pathPlanJsonSchema } from "~/shared/schema";
import { Ollama, defaultModel } from "../llm/Ollama";
import { Search } from "../llm/Search";
import { GoalsRepo } from "../repo/Goals";
import { PathsRepo, PathValidationError } from "../repo/Paths";
import { SettingsRepo } from "../repo/Settings";

const SYSTEM_PROMPT = `You are Komorebi's path strategist.
Use the supplied grounded research for every external fact. Put uncertainty in assumptions.
Create a short, ordered sequence of outcome milestones toward the stable goal.
Each completion criterion must describe concrete, observable evidence, not effort or intention.
Return only the required JSON.`;

const MAX_PLAN_ATTEMPTS = 3;

function plannerFailure(message: string): PathValidationError {
  return new PathValidationError({ message });
}

export function decodePathPlan(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const extracted = start >= 0 && end > start ? raw.slice(start, end + 1) : undefined;
  const candidates = [raw.trim(), fenced?.trim(), extracted?.trim()];
  let error = "Path planner returned invalid JSON.";

  for (const candidate of candidates) {
    if (!candidate) continue;
    let json: unknown;
    try {
      json = JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
    const decoded = Schema.decodeUnknownEither(PathPlanDraftSchema)(json);
    if (decoded._tag === "Right") return decoded;
    error = decoded.left.message;
  }

  return { _tag: "Left", left: error } as const;
}

export class PathPlanner extends Effect.Service<PathPlanner>()("PathPlanner", {
  dependencies: [
    GoalsRepo.Default,
    PathsRepo.Default,
    SettingsRepo.Default,
    Ollama.Default,
    Search.Default
  ],
  effect: Effect.gen(function* () {
    const goals = yield* GoalsRepo;
    const paths = yield* PathsRepo;
    const settings = yield* SettingsRepo;
    const ollama = yield* Ollama;
    const search = yield* Search;

    const generate = (goalId: string) =>
      Effect.gen(function* () {
        const goal = yield* goals.getOrFail(goalId);
        const attempt = yield* paths.start(goalId);
        const work = Effect.gen(function* () {
          const research = yield* search.researchPath(
            `${goal.title}\n${goal.description ?? ""}\n${goal.context ?? ""}`
          );
          const config = yield* settings.get();
          const messages: Array<{ role: "user" | "assistant"; content: string }> = [
            {
              role: "user",
              content: [
                `Goal: ${goal.title}`,
                `Description: ${goal.description ?? ""}`,
                `Context: ${goal.context ?? ""}`,
                `User profile: ${config.profile ?? ""}`,
                `Grounded research: ${research.summary}`,
                "Cited sources:",
                ...research.sources.map(
                  (source) => `${source.title}: ${source.url}\n${source.content}`
                )
              ].join("\n")
            }
          ];
          let lastError = "Path planner returned invalid JSON.";
          for (let planAttempt = 1; planAttempt <= MAX_PLAN_ATTEMPTS; planAttempt++) {
            const raw = yield* ollama.chat({
              model: config.model ?? defaultModel(),
              system: SYSTEM_PROMPT,
              format: pathPlanJsonSchema,
              messages,
              temperature: 0.2
            });
            const decoded = decodePathPlan(raw);
            if (decoded._tag === "Right") {
              return yield* paths.saveDraft(
                attempt.id,
                decoded.right,
                research.sources.map((source) => ({
                  id: randomUUID(),
                  pathId: attempt.id,
                  title: source.title,
                  url: source.url,
                  excerpt: source.content.slice(0, 1500)
                }))
              );
            }
            lastError = decoded.left;
            messages.push(
              { role: "assistant", content: raw.slice(0, 8000) },
              {
                role: "user",
                content:
                  `That response was invalid: ${lastError.slice(0, 500)}. ` +
                  "Return only a complete JSON object matching the requested schema."
              }
            );
          }
          return yield* Effect.fail(plannerFailure(lastError));
        });

        const result = yield* Effect.either(work);
        if (result._tag === "Right") return result.right;
        const message =
          result.left && typeof result.left === "object" && "message" in result.left
            ? String(result.left.message)
            : String(result.left);
        yield* paths.fail(attempt.id, message).pipe(Effect.ignore);
        return yield* Effect.fail(result.left);
      });

    return { generate } as const;
  })
}) {}
