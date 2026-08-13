import { randomUUID } from "node:crypto";
import { Cause, Duration, Effect, Exit } from "effect";
import { Checklist } from "../checklist/Checklist";
import { LlmError } from "../llm/Ollama";
import { SearchError } from "../llm/Search";
import { PathPlanner } from "../paths/PathPlanner";
import {
  GenerationJobs,
  type GenerationJob
} from "./GenerationJobs";

const POLL_INTERVAL = Duration.seconds(1);
const LEASE_DURATION_MS = 90_000;
const HEARTBEAT_INTERVAL = Duration.seconds(30);

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential * (0.5 + random()));
}

export class GenerationWorker extends Effect.Service<GenerationWorker>()("GenerationWorker", {
  dependencies: [GenerationJobs.Default, Checklist.Default, PathPlanner.Default],
  scoped: Effect.gen(function* () {
    const jobs = yield* GenerationJobs;
    const checklist = yield* Checklist;
    const pathPlanner = yield* PathPlanner;
    const workerId = randomUUID();

    const execute = (job: GenerationJob): Effect.Effect<unknown, unknown> => {
      switch (job.kind) {
        case "checklist-generate":
          return checklist.generate();
        case "checklist-regenerate":
          return checklist.regenerateDay();
        case "goal-retry":
          return checklist.retryGoal(payloadString(job, "goalId"));
        case "path-generate":
          return pathPlanner.generate(payloadString(job, "goalId"));
        case "suggestion-regenerate":
          return checklist.regenerateSuggestion(
            payloadString(job, "suggestionId"),
            payloadOptionalString(job, "note")
          );
        case "suggestion-skip-regenerate":
          return checklist.skipAndRegenerate(
            payloadString(job, "suggestionId"),
            payloadOptionalString(job, "reason")
          );
        case "coach-checkin-reply":
          return checklist.sendCheckInMessage(payloadString(job, "content"));
        default:
          return Effect.fail(
            new GenerationJobPayloadError(`Unsupported generation job kind: ${job.kind}`)
          );
      }
    };

    const processJob = (job: GenerationJob): Effect.Effect<void, never> =>
      Effect.scoped(
        Effect.gen(function* () {
          const heartbeat = jobs.heartbeat(job.id, workerId, LEASE_DURATION_MS).pipe(
            Effect.delay(HEARTBEAT_INTERVAL),
            Effect.forever
          );
          const exit = yield* Effect.exit(Effect.raceFirst(execute(job), heartbeat));

          if (Exit.isSuccess(exit)) {
            yield* jobs.succeed(job.id, workerId, exit.value);
            yield* Effect.logInfo("generation job succeeded");
            return;
          }

          const cause = Cause.squash(exit.cause);
          const message = cause instanceof Error ? cause.message : String(cause);
          const permanent =
            cause instanceof GenerationJobPayloadError ||
            (cause instanceof LlmError && cause.permanent) ||
            (cause instanceof SearchError && cause.permanent) ||
            hasPermanentDomainTag(cause, job);

          if (permanent || job.attemptCount >= job.maxAttempts) {
            yield* jobs.fail(
              job.id,
              workerId,
              permanent ? "configuration" : "attempts-exhausted",
              message
            );
            yield* Effect.logError("generation job permanently failed").pipe(
              Effect.annotateLogs({ error: message, permanent })
            );
            return;
          }

          const delay = retryDelayMs(job.attemptCount);
          yield* jobs.retry(
            job.id,
            workerId,
            "transient",
            message,
            new Date(Date.now() + delay)
          );
          yield* Effect.logWarning("generation job scheduled for retry").pipe(
            Effect.annotateLogs({ delayMs: delay, error: message })
          );
        }).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError(
              `generation worker could not settle job: ${Cause.pretty(cause)}`
            )
          ),
          Effect.annotateLogs({
            requestId: payloadCorrelationId(job),
            jobId: job.id,
            generationId: job.id,
            jobKind: job.kind,
            workerId
          })
        )
      );

    const tick = Effect.gen(function* () {
      const job = yield* jobs.claimNext(workerId, LEASE_DURATION_MS);
      if (!job) {
        yield* Effect.sleep(POLL_INTERVAL);
        return;
      }
      yield* processJob(job);
    }).pipe(
      Effect.catchAllCause((cause) =>
        Effect.logError(`generation worker tick failed: ${Cause.pretty(cause)}`).pipe(
          Effect.zipRight(Effect.sleep(POLL_INTERVAL))
        )
      )
    );

    yield* Effect.forkScoped(Effect.forever(tick));
    yield* Effect.logInfo(`generation worker started: ${workerId}`);

    return { workerId } as const;
  })
}) {}

class GenerationJobPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationJobPayloadError";
  }
}

function payloadString(job: GenerationJob, key: string): string {
  const value = payloadRecord(job)[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new GenerationJobPayloadError(`${job.kind} payload requires ${key}.`);
  }
  return value;
}

function payloadOptionalString(job: GenerationJob, key: string): string | undefined {
  const value = payloadRecord(job)[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new GenerationJobPayloadError(`${job.kind} payload ${key} must be text.`);
  }
  return value;
}

function payloadRecord(job: GenerationJob): Record<string, unknown> {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    throw new GenerationJobPayloadError(`${job.kind} payload must be an object.`);
  }
  return job.payload as Record<string, unknown>;
}

function payloadCorrelationId(job: GenerationJob): string {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    return "background";
  }
  const requestId = (job.payload as Record<string, unknown>).requestId;
  return typeof requestId === "string" ? requestId : "background";
}

function hasPermanentDomainTag(cause: unknown, job: GenerationJob): boolean {
  if (!cause || typeof cause !== "object" || !("_tag" in cause)) return false;
  const tag = String((cause as { _tag: unknown })._tag);
  if (tag === "GoalNotFoundError" || tag === "SuggestionNotFoundError") return true;
  // Missing/invalid active paths make checklist jobs unactionable, while a
  // path planner validation failure can be fresh malformed model output and
  // should receive a later durable attempt.
  return tag === "PathValidationError" && job.kind !== "path-generate";
}
