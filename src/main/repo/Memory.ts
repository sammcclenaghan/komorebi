import { Effect } from "effect";
import type { CoachMemory } from "~/shared/schema";
import { Db, DbError } from "../db/Db";

/**
 * The coach's learned working notes about the user — one row, re-distilled
 * at most once a day from ratings, skip reasons, and reflections.
 */
export class MemoryRepo extends Effect.Service<MemoryRepo>()("MemoryRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const get = (): Effect.Effect<CoachMemory | null, DbError> =>
      db.rows("SELECT markdown, updated_date FROM coach_memory WHERE id = 1").pipe(
        Effect.map((rows) => {
          const markdown = rows[0]?.markdown;
          const updatedDate = rows[0]?.updated_date;
          if (typeof markdown !== "string" || typeof updatedDate !== "string") return null;
          return { markdown, updatedDate };
        })
      );

    const set = (markdown: string, updatedDate: string): Effect.Effect<void, DbError> =>
      db
        .execute(
          `INSERT INTO coach_memory (id, markdown, updated_date) VALUES (1, ?, ?)
           ON CONFLICT (id) DO UPDATE SET markdown = excluded.markdown, updated_date = excluded.updated_date`,
          [markdown, updatedDate]
        )
        .pipe(Effect.asVoid);

    return { get, set } as const;
  })
}) {}
