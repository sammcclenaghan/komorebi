import { randomUUID } from "node:crypto";
import { Cause, Duration, Effect, Exit } from "effect";
import { Checklist } from "../checklist/Checklist";
import { LlmError } from "../llm/Ollama";
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
  dependencies: [GenerationJobs.Default, Checklist.Default],
  scoped: Effect.gen(function* () {
    const jobs = yield* GenerationJobs;
    const checklist = yield* Checklist;
    const workerId = randomUUID();

    const execute = (job: GenerationJob): Effect.Effect<unknown, unknown> => {
      switch (job.kind) {
        case "checklist-generate":
          return checklist.generate();
        default:
          return Effect.fail(new Error(`Unsupported generation job kind: ${job.kind}`));
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
            return;
          }

          const cause = Cause.squash(exit.cause);
          const message = cause instanceof Error ? cause.message : String(cause);
          const permanent = cause instanceof LlmError && cause.permanent;

          if (permanent || job.attemptCount >= job.maxAttempts) {
            yield* jobs.fail(
              job.id,
              workerId,
              permanent ? "configuration" : "attempts-exhausted",
              message
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
        }).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError(
              `generation worker could not settle job ${job.id}: ${Cause.pretty(cause)}`
            )
          )
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
