import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DbError } from "../db/Db";
import { makeSearchCache } from "./SearchCache";
import { SEARCH_CACHE_SCHEMA } from "./searchCacheSchema";

describe("SearchCache", () => {
  let directory: string;
  let client: Client;
  let now: Date;
  let cache: ReturnType<typeof makeSearchCache>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "komorebi-search-cache-"));
    client = createClient({ url: `file:${path.join(directory, "cache.db")}` });
    await client.batch([...SEARCH_CACHE_SCHEMA], "write");
    now = new Date("2026-01-01T12:00:00.000Z");
    const failure = (cause: unknown) => new DbError({ message: String(cause), cause });
    cache = makeSearchCache(
      {
        execute: (sql: string, args: InValue[] = []) =>
          Effect.tryPromise({
            try: () => client.execute({ sql, args }),
            catch: failure
          }),
        rows: (sql: string, args: InValue[] = []) =>
          Effect.tryPromise({
            try: async () => [...(await client.execute({ sql, args })).rows],
            catch: failure
          })
      },
      { now: () => new Date(now) }
    );
  });

  afterEach(async () => {
    client.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("distinguishes fresh, stale-usable, and expired entries", async () => {
    await Effect.runPromise(cache.put("query", [{ title: "cached" }], 1_000, 10_000));
    await expect(Effect.runPromise(cache.get("query"))).resolves.toMatchObject({
      fresh: true
    });

    now = new Date(now.getTime() + 2_000);
    await expect(Effect.runPromise(cache.get("query"))).resolves.toMatchObject({
      fresh: false,
      value: [{ title: "cached" }]
    });

    now = new Date(now.getTime() + 10_000);
    await expect(Effect.runPromise(cache.get("query"))).resolves.toBeNull();
  });
});
