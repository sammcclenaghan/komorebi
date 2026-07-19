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

export class DbError extends Data.TaggedError("DbError")<{
  message: string;
  cause?: unknown;
}> {
  override toString(): string {
    return `Database error: ${this.message}`;
  }
}

function makeClient(): Client {
  const url = process.env.TURSO_DB_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (url) {
    return createClient(authToken ? { url, authToken } : { url });
  }
  const { dataDir, dbFile } = resolvePaths();
  fs.mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.resolve(dbFile)}` });
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail_markdown TEXT NOT NULL,
    resource_url TEXT,
    estimated_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    rating TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS reflections (
    id TEXT PRIMARY KEY,
    suggestion_id TEXT NOT NULL,
    text TEXT NOT NULL,
    rating TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    data TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS day_briefs (
    date TEXT PRIMARY KEY,
    markdown TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_goal ON suggestions(goal_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_reflections_suggestion ON reflections(suggestion_id)`
];

async function initSchema(client: Client): Promise<void> {
  await client.batch(SCHEMA, "write");
  // Tables created before a column existed: ADD COLUMN throws when the
  // column is already there, so each is best-effort.
  try {
    await client.execute("ALTER TABLE goals ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  } catch {
    // Column already exists.
  }
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
      try: () => initSchema(client),
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
