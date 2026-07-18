import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { Effect } from "effect";
import { ReflectionSchema, type Reflection } from "~/shared/schema";
import { Db, DbError } from "../db/Db";
import { decodeRow, text } from "./rows";

const decodeReflection = decodeRow(ReflectionSchema, "reflection");

const fromRow = (row: Row): Effect.Effect<Reflection, DbError> =>
  decodeReflection({
    id: text(row, "id"),
    suggestionId: text(row, "suggestion_id"),
    text: text(row, "text"),
    rating: text(row, "rating"),
    createdAt: text(row, "created_at")
  });

export type ReflectionInput = {
  suggestionId: string;
  text: string;
  rating?: "up" | "down" | null;
};

export class ReflectionsRepo extends Effect.Service<ReflectionsRepo>()("ReflectionsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const listForSuggestion = (suggestionId: string): Effect.Effect<Reflection[], DbError> =>
      db
        .rows(
          "SELECT * FROM reflections WHERE suggestion_id = ? ORDER BY created_at ASC",
          [suggestionId]
        )
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    const listAll = (): Effect.Effect<Reflection[], DbError> =>
      db
        .rows("SELECT * FROM reflections ORDER BY created_at ASC")
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    const add = (input: ReflectionInput): Effect.Effect<Reflection, DbError> =>
      Effect.suspend(() => {
        const reflection: Reflection = {
          id: randomUUID(),
          suggestionId: input.suggestionId,
          text: input.text.trim(),
          rating: input.rating ?? null,
          createdAt: new Date().toISOString()
        };
        return db
          .execute(
            "INSERT INTO reflections (id, suggestion_id, text, rating, created_at) VALUES (?, ?, ?, ?, ?)",
            [
              reflection.id,
              reflection.suggestionId,
              reflection.text,
              reflection.rating,
              reflection.createdAt
            ]
          )
          .pipe(Effect.as(reflection));
      });

    const removeForSuggestions = (suggestionIds: string[]): Effect.Effect<void, DbError> => {
      if (suggestionIds.length === 0) return Effect.void;
      const placeholders = suggestionIds.map(() => "?").join(", ");
      return db
        .execute(`DELETE FROM reflections WHERE suggestion_id IN (${placeholders})`, suggestionIds)
        .pipe(Effect.asVoid);
    };

    return { listForSuggestion, listAll, add, removeForSuggestions } as const;
  })
}) {}
