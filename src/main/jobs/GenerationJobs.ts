import { randomUUID } from "node:crypto";
import type { InValue, Row } from "@libsql/client";
import { Data, Effect } from "effect";
import { Db, DbError } from "../db/Db";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed";

export type GenerationJob = {
  id: string;
  kind: string;
  idempotencyKey: string;
  payload: unknown;
  status: GenerationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  errorKind: string | null;
  errorMessage: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type EnqueueGenerationJob = {
  kind: string;
  idempotencyKey: string;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
};

export class GenerationJobLeaseLostError extends Data.TaggedError(
  "GenerationJobLeaseLostError"
)<{
  id: string;
  workerId: string;
}> {
  get message(): string {
    return `Worker ${this.workerId} no longer owns generation job ${this.id}.`;
  }
}

type JobDatabase = {
  rows: (sql: string, args?: InValue[]) => Effect.Effect<Row[], DbError>;
};

type JobClock = {
  now: () => Date;
};

const systemClock: JobClock = { now: () => new Date() };

export function makeGenerationJobs(db: JobDatabase, clock: JobClock = systemClock) {
  const get = (id: string): Effect.Effect<GenerationJob | null, DbError> =>
    db.rows("SELECT * FROM generation_jobs WHERE id = ?", [id]).pipe(
      Effect.flatMap((rows) => rows.length === 0 ? Effect.succeed(null) : fromRow(rows[0]!))
    );

  const listRecent = (limit: number = 20): Effect.Effect<GenerationJob[], DbError> =>
    db.rows(
      "SELECT * FROM generation_jobs ORDER BY updated_at DESC LIMIT ?",
      [Math.max(1, Math.min(limit, 100))]
    ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, fromRow)));

  const enqueue = (input: EnqueueGenerationJob): Effect.Effect<GenerationJob, DbError> =>
    Effect.suspend(() => {
      const now = clock.now();
      const nowIso = now.toISOString();
      const availableAt = (input.availableAt ?? now).toISOString();
      return db.rows(
        `INSERT INTO generation_jobs
           (id, kind, idempotency_key, payload_json, status, attempt_count, max_attempts,
            available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)
         ON CONFLICT(idempotency_key) DO UPDATE SET id = generation_jobs.id
         RETURNING *`,
        [
          randomUUID(),
          input.kind,
          input.idempotencyKey,
          JSON.stringify(input.payload),
          input.maxAttempts ?? 12,
          availableAt,
          nowIso,
          nowIso
        ]
      ).pipe(Effect.flatMap((rows) => fromRow(rows[0]!)));
    });

  const claimNext = (
    workerId: string,
    leaseDurationMs: number
  ): Effect.Effect<GenerationJob | null, DbError> =>
    Effect.suspend(() => {
      const now = clock.now();
      const nowIso = now.toISOString();
      const leaseUntil = new Date(now.getTime() + leaseDurationMs).toISOString();
      return db.rows(
        `UPDATE generation_jobs
         SET status = 'running',
             attempt_count = attempt_count + CASE WHEN status = 'running' THEN 0 ELSE 1 END,
             lease_owner = ?,
             lease_until = ?,
             updated_at = ?,
             error_kind = NULL,
             error_message = NULL
         WHERE id = (
           SELECT id
           FROM generation_jobs
           WHERE (
             status IN ('queued', 'retry_wait')
             AND attempt_count < max_attempts
             AND available_at <= ?
           ) OR (
             status = 'running'
             AND lease_until <= ?
           )
           ORDER BY available_at ASC, created_at ASC
           LIMIT 1
         )
         RETURNING *`,
        [workerId, leaseUntil, nowIso, nowIso, nowIso]
      ).pipe(
        Effect.flatMap((rows) => rows.length === 0 ? Effect.succeed(null) : fromRow(rows[0]!))
      );
    });

  const heartbeat = (
    id: string,
    workerId: string,
    leaseDurationMs: number
  ): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> =>
    updateOwned(
      id,
      workerId,
      `lease_until = ?, updated_at = ?`,
      (() => {
        const now = clock.now();
        return [new Date(now.getTime() + leaseDurationMs).toISOString(), now.toISOString()];
      })()
    );

  const succeed = (
    id: string,
    workerId: string,
    result: unknown
  ): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> => {
    const now = clock.now().toISOString();
    return updateOwned(
      id,
      workerId,
      `status = 'succeeded', result_json = ?, lease_owner = NULL, lease_until = NULL,
       error_kind = NULL, error_message = NULL, completed_at = ?, updated_at = ?`,
      [JSON.stringify(result), now, now]
    );
  };

  const retry = (
    id: string,
    workerId: string,
    errorKind: string,
    errorMessage: string,
    availableAt: Date
  ): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> =>
    updateOwned(
      id,
      workerId,
      `status = 'retry_wait', available_at = ?, lease_owner = NULL, lease_until = NULL,
       error_kind = ?, error_message = ?, updated_at = ?`,
      [availableAt.toISOString(), errorKind, errorMessage, clock.now().toISOString()]
    );

  const fail = (
    id: string,
    workerId: string,
    errorKind: string,
    errorMessage: string
  ): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> => {
    const now = clock.now().toISOString();
    return updateOwned(
      id,
      workerId,
      `status = 'failed', lease_owner = NULL, lease_until = NULL, error_kind = ?,
       error_message = ?, completed_at = ?, updated_at = ?`,
      [errorKind, errorMessage, now, now]
    );
  };

  function updateOwned(
    id: string,
    workerId: string,
    assignments: string,
    values: InValue[]
  ): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> {
    return db.rows(
      `UPDATE generation_jobs
       SET ${assignments}
       WHERE id = ? AND status = 'running' AND lease_owner = ?
       RETURNING *`,
      [...values, id, workerId]
    ).pipe(
      Effect.flatMap(
        (rows): Effect.Effect<GenerationJob, DbError | GenerationJobLeaseLostError> =>
          rows.length === 0
            ? Effect.fail(new GenerationJobLeaseLostError({ id, workerId }))
            : fromRow(rows[0]!)
      )
    );
  }

  return { get, listRecent, enqueue, claimNext, heartbeat, succeed, retry, fail } as const;
}

export class GenerationJobs extends Effect.Service<GenerationJobs>()("GenerationJobs", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    return makeGenerationJobs(yield* Db);
  })
}) {}

function fromRow(row: Row): Effect.Effect<GenerationJob, DbError> {
  return Effect.try({
    try: () => ({
      id: requiredText(row, "id"),
      kind: requiredText(row, "kind"),
      idempotencyKey: requiredText(row, "idempotency_key"),
      payload: parseJson(requiredText(row, "payload_json")),
      status: jobStatus(row.status),
      attemptCount: requiredInteger(row, "attempt_count"),
      maxAttempts: requiredInteger(row, "max_attempts"),
      availableAt: requiredText(row, "available_at"),
      leaseOwner: optionalText(row, "lease_owner"),
      leaseUntil: optionalText(row, "lease_until"),
      errorKind: optionalText(row, "error_kind"),
      errorMessage: optionalText(row, "error_message"),
      result: optionalText(row, "result_json") === null
        ? null
        : parseJson(optionalText(row, "result_json")!),
      createdAt: requiredText(row, "created_at"),
      updatedAt: requiredText(row, "updated_at"),
      completedAt: optionalText(row, "completed_at")
    }),
    catch: (cause) =>
      new DbError({
        message: `Corrupted generation job row: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause
      })
  });
}

function requiredText(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`${key} must be text`);
  return value;
}

function optionalText(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${key} must be text or null`);
  return value;
}

function requiredInteger(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`${key} must be an integer`);
}

function jobStatus(value: unknown): GenerationJobStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "retry_wait" ||
    value === "succeeded" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("status is invalid");
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
