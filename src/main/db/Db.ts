/**
 * The one and only persistence layer: libsql/Turso.
 *
 * `TURSO_DB_URL` (+ `TURSO_AUTH_TOKEN` for remote databases) selects the
 * database. Without them the app falls back to a local libsql file in the
 * data directory — same engine, same schema, zero setup — so there is no
 * second storage implementation to drift or corrupt. (The old JSON file
 * store is gone.)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import type { Client, InStatement, InValue, ResultSet, Row } from "@libsql/client";
import { Data, Effect } from "effect";
import { resolvePaths } from "../paths";
import { configureDatabase, runMigrations } from "./migrations";

export class DbError extends Data.TaggedError("DbError")<{
  message: string;
  cause?: unknown;
}> {
  override toString(): string {
    return `Database error: ${this.message}`;
  }
}

export function makeClient(): Client {
  const url = process.env.TURSO_DB_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (url) {
    return createClient(authToken ? { url, authToken } : { url });
  }
  const { dataDir, dbFile } = resolvePaths();
  fs.mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.resolve(dbFile)}` });
}

export class Db extends Effect.Service<Db>()("Db", {
  scoped: Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      Effect.try({
        try: () => makeClient(),
        catch: (cause) =>
          new DbError({ message: `Could not open the database: ${describe(cause)}`, cause })
      }),
      (c) => Effect.sync(() => c.close())
    );

    yield* Effect.tryPromise({
      try: async () => {
        await configureDatabase(client, !process.env.TURSO_DB_URL?.trim());
        await runMigrations(client);
        // libSQL transactions may rotate the underlying connection. Reapply
        // connection-scoped foreign-key and busy-timeout settings afterwards.
        await configureDatabase(client, !process.env.TURSO_DB_URL?.trim());
      },
      catch: (cause) =>
        new DbError({ message: `Database schema setup failed: ${describe(cause)}`, cause })
    });

    const execute = (
      sql: string,
      args: InValue[] = []
    ): Effect.Effect<ResultSet, DbError> =>
      Effect.tryPromise({
        try: () => client.execute({ sql, args }),
        catch: (cause) => new DbError({ message: describe(cause), cause })
      });

    const batch = (statements: InStatement[]): Effect.Effect<ResultSet[], DbError> =>
      Effect.tryPromise({
        try: () => client.batch(statements, "write"),
        catch: (cause) => new DbError({ message: describe(cause), cause })
      });

    const rows = (sql: string, args: InValue[] = []): Effect.Effect<Row[], DbError> =>
      execute(sql, args).pipe(Effect.map((rs) => [...rs.rows]));

    return { client, execute, batch, rows } as const;
  })
}) {}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
