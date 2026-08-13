import type { InValue, Row } from "@libsql/client";
import { Effect } from "effect";
import { Db, DbError } from "../db/Db";

export type CachedSearchValue = {
  value: unknown;
  fresh: boolean;
};

type CacheDatabase = {
  execute: (sql: string, args?: InValue[]) => Effect.Effect<unknown, DbError>;
  rows: (sql: string, args?: InValue[]) => Effect.Effect<Row[], DbError>;
};

type CacheClock = {
  now: () => Date;
};

const systemClock: CacheClock = { now: () => new Date() };

export function makeSearchCache(db: CacheDatabase, clock: CacheClock = systemClock) {
  const get = (key: string): Effect.Effect<CachedSearchValue | null, DbError> =>
    Effect.gen(function* () {
      const now = clock.now().toISOString();
      const rows = yield* db.rows(
        `SELECT value_json, fresh_until
         FROM search_cache
         WHERE cache_key = ? AND stale_until > ?`,
        [key, now]
      );
      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (typeof row.value_json !== "string" || typeof row.fresh_until !== "string") {
        return yield* Effect.fail(
          new DbError({ message: `Corrupted search cache row: ${key}` })
        );
      }
      try {
        return {
          value: JSON.parse(row.value_json) as unknown,
          fresh: row.fresh_until > now
        };
      } catch (cause) {
        return yield* Effect.fail(
          new DbError({ message: `Invalid search cache JSON: ${key}`, cause })
        );
      }
    });

  const put = (
    key: string,
    value: unknown,
    freshForMs: number,
    staleForMs: number
  ): Effect.Effect<void, DbError> =>
    Effect.suspend(() => {
      const now = clock.now();
      return db.execute(
        `INSERT INTO search_cache
           (cache_key, value_json, fresh_until, stale_until, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           value_json = excluded.value_json,
           fresh_until = excluded.fresh_until,
           stale_until = excluded.stale_until,
           updated_at = excluded.updated_at`,
        [
          key,
          JSON.stringify(value),
          new Date(now.getTime() + freshForMs).toISOString(),
          new Date(now.getTime() + staleForMs).toISOString(),
          now.toISOString()
        ]
      ).pipe(Effect.asVoid);
    });

  const prune = (): Effect.Effect<void, DbError> =>
    db.execute("DELETE FROM search_cache WHERE stale_until <= ?", [
      clock.now().toISOString()
    ]).pipe(Effect.asVoid);

  return { get, put, prune } as const;
}

export class SearchCache extends Effect.Service<SearchCache>()("SearchCache", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    return makeSearchCache(yield* Db);
  })
}) {}
