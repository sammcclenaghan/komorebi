import { Effect } from "effect";
import { Db, DbError } from "../db/Db";

/** One coach brief per day, keyed by YYYY-MM-DD. */
export class BriefsRepo extends Effect.Service<BriefsRepo>()("BriefsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const get = (date: string): Effect.Effect<string | null, DbError> =>
      db.rows("SELECT markdown FROM day_briefs WHERE date = ?", [date]).pipe(
        Effect.map((rows) => {
          const markdown = rows[0]?.markdown;
          return typeof markdown === "string" ? markdown : null;
        })
      );

    const upsert = (date: string, markdown: string): Effect.Effect<void, DbError> =>
      db
        .execute(
          `INSERT INTO day_briefs (date, markdown, created_at) VALUES (?, ?, ?)
           ON CONFLICT (date) DO UPDATE SET markdown = excluded.markdown, created_at = excluded.created_at`,
          [date, markdown, new Date().toISOString()]
        )
        .pipe(Effect.asVoid);

    const remove = (date: string): Effect.Effect<void, DbError> =>
      db.execute("DELETE FROM day_briefs WHERE date = ?", [date]).pipe(Effect.asVoid);

    return { get, upsert, remove } as const;
  })
}) {}
