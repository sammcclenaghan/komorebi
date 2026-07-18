import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { Data, Effect } from "effect";
import {
  SuggestionSchema,
  type Suggestion,
  type SuggestionDraft,
  type SuggestionRating,
  type SuggestionStatus
} from "~/shared/schema";
import { Db, DbError } from "../db/Db";
import { decodeRow, integer, text } from "./rows";

export class SuggestionNotFoundError extends Data.TaggedError("SuggestionNotFoundError")<{
  id: string;
}> {
  get message(): string {
    return `Suggestion not found: ${this.id}`;
  }
}

const decodeSuggestion = decodeRow(SuggestionSchema, "suggestion");

const fromRow = (row: Row): Effect.Effect<Suggestion, DbError> =>
  decodeSuggestion({
    id: text(row, "id"),
    goalId: text(row, "goal_id"),
    date: text(row, "date"),
    title: text(row, "title"),
    summary: text(row, "summary"),
    detailMarkdown: text(row, "detail_markdown"),
    resourceUrl: text(row, "resource_url"),
    estimatedMinutes: integer(row, "estimated_minutes"),
    status: text(row, "status"),
    rating: text(row, "rating"),
    createdAt: text(row, "created_at"),
    completedAt: text(row, "completed_at")
  });

export type InsertSuggestionInput = {
  goalId: string;
  date: string;
  draft: SuggestionDraft;
};

export class SuggestionsRepo extends Effect.Service<SuggestionsRepo>()("SuggestionsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const all = (rowsList: Row[]) => Effect.forEach(rowsList, fromRow);

    const listAll = (): Effect.Effect<Suggestion[], DbError> =>
      db.rows("SELECT * FROM suggestions ORDER BY created_at ASC").pipe(Effect.flatMap(all));

    const listForDate = (date: string): Effect.Effect<Suggestion[], DbError> =>
      db
        .rows("SELECT * FROM suggestions WHERE date = ? ORDER BY created_at ASC", [date])
        .pipe(Effect.flatMap(all));

    const listRecentForGoal = (
      goalId: string,
      limit: number
    ): Effect.Effect<Suggestion[], DbError> =>
      db
        .rows(
          "SELECT * FROM suggestions WHERE goal_id = ? ORDER BY date DESC, created_at DESC LIMIT ?",
          [goalId, limit]
        )
        .pipe(Effect.flatMap(all));

    const get = (id: string): Effect.Effect<Suggestion | null, DbError> =>
      db.rows("SELECT * FROM suggestions WHERE id = ?", [id]).pipe(
        Effect.flatMap((rows) =>
          rows.length === 0 ? Effect.succeed(null) : fromRow(rows[0]!)
        )
      );

    const getOrFail = (
      id: string
    ): Effect.Effect<Suggestion, DbError | SuggestionNotFoundError> =>
      get(id).pipe(
        Effect.flatMap((s) =>
          s ? Effect.succeed(s) : Effect.fail(new SuggestionNotFoundError({ id }))
        )
      );

    const insert = (input: InsertSuggestionInput): Effect.Effect<Suggestion, DbError> =>
      Effect.suspend(() => {
        const suggestion: Suggestion = {
          id: randomUUID(),
          goalId: input.goalId,
          date: input.date,
          title: input.draft.title,
          summary: input.draft.summary,
          detailMarkdown: input.draft.detailMarkdown,
          resourceUrl: input.draft.resourceUrl,
          estimatedMinutes: input.draft.estimatedMinutes,
          status: "pending",
          rating: null,
          createdAt: new Date().toISOString(),
          completedAt: null
        };
        return db
          .execute(
            `INSERT INTO suggestions
               (id, goal_id, date, title, summary, detail_markdown, resource_url,
                estimated_minutes, status, rating, created_at, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              suggestion.id,
              suggestion.goalId,
              suggestion.date,
              suggestion.title,
              suggestion.summary,
              suggestion.detailMarkdown,
              suggestion.resourceUrl,
              suggestion.estimatedMinutes,
              suggestion.status,
              suggestion.rating,
              suggestion.createdAt,
              suggestion.completedAt
            ]
          )
          .pipe(Effect.as(suggestion));
      });

    const setStatus = (
      id: string,
      status: SuggestionStatus
    ): Effect.Effect<Suggestion, DbError | SuggestionNotFoundError> =>
      Effect.gen(function* () {
        const completedAt = status === "done" ? new Date().toISOString() : null;
        const updated = yield* db.rows(
          "UPDATE suggestions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ? RETURNING *",
          [status, completedAt, id]
        );
        if (updated.length === 0) {
          return yield* Effect.fail(new SuggestionNotFoundError({ id }));
        }
        return yield* fromRow(updated[0]!);
      });

    const setRating = (
      id: string,
      rating: SuggestionRating
    ): Effect.Effect<Suggestion, DbError | SuggestionNotFoundError> =>
      Effect.gen(function* () {
        const updated = yield* db.rows(
          "UPDATE suggestions SET rating = ? WHERE id = ? RETURNING *",
          [rating, id]
        );
        if (updated.length === 0) {
          return yield* Effect.fail(new SuggestionNotFoundError({ id }));
        }
        return yield* fromRow(updated[0]!);
      });

    /** Delete one suggestion. Returns whether a row was removed. */
    const remove = (id: string): Effect.Effect<boolean, DbError> =>
      db
        .rows("DELETE FROM suggestions WHERE id = ? RETURNING id", [id])
        .pipe(Effect.map((rows) => rows.length > 0));

    /** Delete every suggestion on a given day. Returns the removed IDs. */
    const removeForDate = (date: string): Effect.Effect<string[], DbError> =>
      db
        .rows("DELETE FROM suggestions WHERE date = ? RETURNING id", [date])
        .pipe(Effect.map((rows) => rows.map((r) => String(r.id))));

    /** Delete every suggestion for a goal. Returns the removed IDs. */
    const removeForGoal = (goalId: string): Effect.Effect<string[], DbError> =>
      db
        .rows("DELETE FROM suggestions WHERE goal_id = ? RETURNING id", [goalId])
        .pipe(Effect.map((rows) => rows.map((r) => String(r.id))));

    return {
      listAll,
      listForDate,
      listRecentForGoal,
      get,
      getOrFail,
      insert,
      setStatus,
      setRating,
      remove,
      removeForDate,
      removeForGoal
    } as const;
  })
}) {}
