import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { Data, Effect } from "effect";
import {
  GoalSchema,
  type Goal,
  type GoalPriority,
  type GoalStatus
} from "~/shared/schema";
import { Db, DbError } from "../db/Db";
import { decodeRow, text } from "./rows";

export class GoalNotFoundError extends Data.TaggedError("GoalNotFoundError")<{
  id: string;
}> {
  get message(): string {
    return `Goal not found: ${this.id}`;
  }
}

export type GoalInput = {
  title: string;
  description?: string;
  context?: string;
  priority?: GoalPriority;
};

export type GoalUpdates = Partial<
  Pick<Goal, "title" | "description" | "context" | "status" | "priority">
>;

const VALID_PRIORITIES: ReadonlySet<string> = new Set(["high", "medium", "low"]);
const VALID_STATUSES: ReadonlySet<string> = new Set(["active", "paused", "done"]);

export function normalizePriority(input: unknown): GoalPriority {
  return typeof input === "string" && VALID_PRIORITIES.has(input)
    ? (input as GoalPriority)
    : "medium";
}

function normalizeStatus(input: unknown): GoalStatus {
  return typeof input === "string" && VALID_STATUSES.has(input)
    ? (input as GoalStatus)
    : "active";
}

const decodeGoal = decodeRow(GoalSchema, "goal");

const fromRow = (row: Row): Effect.Effect<Goal, DbError> =>
  decodeGoal({
    id: text(row, "id"),
    title: text(row, "title"),
    description: text(row, "description"),
    context: text(row, "context"),
    status: normalizeStatus(text(row, "status")),
    priority: normalizePriority(text(row, "priority")),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at")
  });

export class GoalsRepo extends Effect.Service<GoalsRepo>()("GoalsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const list = (): Effect.Effect<Goal[], DbError> =>
      db
        .rows("SELECT * FROM goals ORDER BY created_at ASC")
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    const listActive = (): Effect.Effect<Goal[], DbError> =>
      db
        .rows("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC")
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    const get = (id: string): Effect.Effect<Goal | null, DbError> =>
      db.rows("SELECT * FROM goals WHERE id = ?", [id]).pipe(
        Effect.flatMap((rows) =>
          rows.length === 0 ? Effect.succeed(null) : fromRow(rows[0]!)
        )
      );

    const getOrFail = (id: string): Effect.Effect<Goal, DbError | GoalNotFoundError> =>
      get(id).pipe(
        Effect.flatMap((goal) =>
          goal ? Effect.succeed(goal) : Effect.fail(new GoalNotFoundError({ id }))
        )
      );

    const add = (input: GoalInput): Effect.Effect<Goal, DbError> =>
      Effect.suspend(() => {
        const now = new Date().toISOString();
        const goal: Goal = {
          id: randomUUID(),
          title: input.title.trim(),
          description: input.description?.trim() || null,
          context: input.context?.trim() || null,
          status: "active",
          priority: normalizePriority(input.priority),
          createdAt: now,
          updatedAt: now
        };
        return db
          .execute(
            `INSERT INTO goals (id, title, description, context, status, priority, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              goal.id,
              goal.title,
              goal.description,
              goal.context,
              goal.status,
              goal.priority,
              goal.createdAt,
              goal.updatedAt
            ]
          )
          .pipe(Effect.as(goal));
      });

    const update = (
      id: string,
      updates: GoalUpdates
    ): Effect.Effect<Goal, DbError | GoalNotFoundError> =>
      getOrFail(id).pipe(
        Effect.flatMap((existing) => {
          const next: Goal = {
            ...existing,
            title: updates.title !== undefined ? updates.title.trim() : existing.title,
            description:
              updates.description !== undefined
                ? updates.description?.trim() || null
                : existing.description,
            context:
              updates.context !== undefined
                ? updates.context?.trim() || null
                : existing.context,
            status: updates.status !== undefined ? normalizeStatus(updates.status) : existing.status,
            priority:
              updates.priority !== undefined
                ? normalizePriority(updates.priority)
                : existing.priority,
            updatedAt: new Date().toISOString()
          };
          return db
            .execute(
              `UPDATE goals SET title = ?, description = ?, context = ?, status = ?, priority = ?, updated_at = ?
               WHERE id = ?`,
              [
                next.title,
                next.description,
                next.context,
                next.status,
                next.priority,
                next.updatedAt,
                id
              ]
            )
            .pipe(Effect.as(next));
        })
      );

    const remove = (id: string): Effect.Effect<void, DbError> =>
      db.execute("DELETE FROM goals WHERE id = ?", [id]).pipe(Effect.asVoid);

    return { list, listActive, get, getOrFail, add, update, remove } as const;
  })
}) {}
