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

function plannerFailure(message: string): PathValidationError {
  return new PathValidationError({ message });
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
          const raw = yield* ollama.chat({
            model: config.model ?? defaultModel(),
            system: SYSTEM_PROMPT,
            format: pathPlanJsonSchema,
            messages: [
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
            ],
            temperature: 0.2
          });
          let json: unknown;
          try {
            json = JSON.parse(raw) as unknown;
          } catch {
            return yield* Effect.fail(plannerFailure("Path planner returned invalid JSON."));
          }
          const decoded = Schema.decodeUnknownEither(PathPlanDraftSchema)(json);
          if (decoded._tag === "Left") {
            return yield* Effect.fail(plannerFailure(decoded.left.message));
          }
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
