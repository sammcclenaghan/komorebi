import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DbError } from "../db/Db";
import {
  GenerationJobLeaseLostError,
  makeGenerationJobs
} from "./GenerationJobs";
import { GENERATION_JOBS_SCHEMA } from "./schema";

describe("GenerationJobs", () => {
  let directory: string;
  let client: Client;
  let now: Date;
  let jobs: ReturnType<typeof makeGenerationJobs>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "komorebi-jobs-"));
    client = createClient({ url: `file:${path.join(directory, "jobs.db")}` });
    await client.batch([...GENERATION_JOBS_SCHEMA], "write");
    now = new Date("2026-01-01T12:00:00.000Z");
    jobs = makeGenerationJobs(
      {
        rows: (sql: string, args: InValue[] = []) =>
          Effect.tryPromise({
            try: async () => [...(await client.execute({ sql, args })).rows],
            catch: (cause) => new DbError({ message: String(cause), cause })
          })
      },
      { now: () => new Date(now) }
    );
  });

  afterEach(async () => {
    client.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("enqueues idempotently", async () => {
    const first = await Effect.runPromise(
      jobs.enqueue({
        kind: "checklist-generate",
        idempotencyKey: "checklist:2026-01-01",
        payload: { date: "2026-01-01" }
      })
    );
    const duplicate = await Effect.runPromise(
      jobs.enqueue({
        kind: "checklist-generate",
        idempotencyKey: "checklist:2026-01-01",
        payload: { date: "different" }
      })
    );

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.payload).toEqual({ date: "2026-01-01" });
    expect(duplicate.status).toBe("queued");
  });

  it("allows only the lease owner to settle a running job", async () => {
    const queued = await Effect.runPromise(
      jobs.enqueue({
        kind: "goal-retry",
        idempotencyKey: "goal:one:retry:1",
        payload: { goalId: "one" }
      })
    );
    const claimed = await Effect.runPromise(jobs.claimNext("worker-a", 30_000));
    expect(claimed?.id).toBe(queued.id);
    expect(claimed?.attemptCount).toBe(1);

    const wrongOwner = await Effect.runPromiseExit(
      jobs.succeed(queued.id, "worker-b", { suggestionId: "new" })
    );
    expect(Exit.isFailure(wrongOwner)).toBe(true);
    if (Exit.isFailure(wrongOwner)) {
      const failure = wrongOwner.cause._tag === "Fail" ? wrongOwner.cause.error : null;
      expect(failure).toBeInstanceOf(GenerationJobLeaseLostError);
    }

    const succeeded = await Effect.runPromise(
      jobs.succeed(queued.id, "worker-a", { suggestionId: "new" })
    );
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.result).toEqual({ suggestionId: "new" });
    expect(succeeded.leaseOwner).toBeNull();
  });

  it("does not expose retries before their scheduled time", async () => {
    const queued = await Effect.runPromise(
      jobs.enqueue({
        kind: "path-generate",
        idempotencyKey: "path:goal-one:v2",
        payload: { goalId: "goal-one" }
      })
    );
    await Effect.runPromise(jobs.claimNext("worker-a", 30_000));
    await Effect.runPromise(
      jobs.retry(
        queued.id,
        "worker-a",
        "ollama-unavailable",
        "connection refused",
        new Date(now.getTime() + 60_000)
      )
    );

    await expect(Effect.runPromise(jobs.claimNext("worker-b", 30_000))).resolves.toBeNull();

    now = new Date(now.getTime() + 60_000);
    const retried = await Effect.runPromise(jobs.claimNext("worker-b", 30_000));
    expect(retried?.id).toBe(queued.id);
    expect(retried?.attemptCount).toBe(2);
    expect(retried?.errorKind).toBeNull();
  });

  it("recovers expired leases without consuming another attempt", async () => {
    const queued = await Effect.runPromise(
      jobs.enqueue({
        kind: "checklist-generate",
        idempotencyKey: "checklist:crash-recovery",
        payload: {},
        maxAttempts: 1
      })
    );
    const firstClaim = await Effect.runPromise(jobs.claimNext("crashed-worker", 1_000));
    expect(firstClaim?.attemptCount).toBe(1);

    now = new Date(now.getTime() + 2_000);
    const recovered = await Effect.runPromise(jobs.claimNext("replacement-worker", 30_000));
    expect(recovered?.id).toBe(queued.id);
    expect(recovered?.attemptCount).toBe(1);
    expect(recovered?.leaseOwner).toBe("replacement-worker");
  });

  it("renews owned leases and records actionable permanent failures", async () => {
    const queued = await Effect.runPromise(
      jobs.enqueue({
        kind: "checklist-generate",
        idempotencyKey: "checklist:permanent-failure",
        payload: {}
      })
    );
    await Effect.runPromise(jobs.claimNext("worker-a", 1_000));

    now = new Date(now.getTime() + 500);
    const heartbeat = await Effect.runPromise(jobs.heartbeat(queued.id, "worker-a", 30_000));
    expect(heartbeat.leaseUntil).toBe(new Date(now.getTime() + 30_000).toISOString());

    const failed = await Effect.runPromise(
      jobs.fail(
        queued.id,
        "worker-a",
        "configuration",
        "The configured Ollama model does not exist."
      )
    );
    expect(failed.status).toBe("failed");
    expect(failed.errorKind).toBe("configuration");
    expect(failed.errorMessage).toContain("model does not exist");
    expect(failed.completedAt).toBe(now.toISOString());
    expect(failed.leaseOwner).toBeNull();
  });
});
