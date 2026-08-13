import type { Client, InStatement, Transaction } from "@libsql/client";
import { GENERATION_JOBS_SCHEMA } from "../jobs/schema";
import { SEARCH_CACHE_SCHEMA } from "../llm/searchCacheSchema";

type Migration = {
  version: number;
  name: string;
  statements: readonly string[];
  prepare?: (transaction: Transaction) => Promise<readonly InStatement[]>;
};

const BASE_SCHEMA = [
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
    path_id TEXT,
    milestone_id TEXT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail_markdown TEXT NOT NULL,
    resource_url TEXT,
    estimated_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    rating TEXT,
    generation_warning TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS goal_paths (
    id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0, assumptions TEXT NOT NULL DEFAULT '', research_summary TEXT NOT NULL DEFAULT '',
    research_at TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS path_milestones (
    id TEXT PRIMARY KEY, path_id TEXT NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL,
    outcome TEXT NOT NULL, rationale TEXT NOT NULL, completion_criteria TEXT NOT NULL, status TEXT NOT NULL,
    completion_evidence TEXT, completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS path_sources (id TEXT PRIMARY KEY, path_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, excerpt TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_path ON goal_paths(goal_id) WHERE status = 'active'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_milestone ON path_milestones(path_id) WHERE status = 'current'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_path_version ON goal_paths(goal_id, version)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_path_candidate ON goal_paths(goal_id)
    WHERE status IN ('generating', 'draft')`,
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
  `CREATE TABLE IF NOT EXISTS coach_memory (
    id INTEGER PRIMARY KEY DEFAULT 1,
    markdown TEXT NOT NULL,
    updated_date TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coach_checkin_messages (
    id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_goal ON suggestions(goal_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_reflections_suggestion ON reflections(suggestion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coach_checkins_week ON coach_checkin_messages(week_start, created_at)`,
  ...GENERATION_JOBS_SCHEMA,
  ...SEARCH_CACHE_SCHEMA
] as const;

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "baseline-schema",
    statements: BASE_SCHEMA
  },
  {
    version: 2,
    name: "legacy-generation-columns",
    statements: [],
    prepare: async (transaction) => {
      const statements: InStatement[] = [];
      const goalColumns = await columnNames(transaction, "goals");
      const suggestionColumns = await columnNames(transaction, "suggestions");

      if (!goalColumns.has("priority")) {
        statements.push("ALTER TABLE goals ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
      }
      if (!suggestionColumns.has("generation_warning")) {
        statements.push("ALTER TABLE suggestions ADD COLUMN generation_warning TEXT");
      }
      if (!suggestionColumns.has("path_id")) {
        statements.push("ALTER TABLE suggestions ADD COLUMN path_id TEXT");
      }
      if (!suggestionColumns.has("milestone_id")) {
        statements.push("ALTER TABLE suggestions ADD COLUMN milestone_id TEXT");
      }
      return statements;
    }
  }
];

const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export async function configureDatabase(client: Client, local: boolean): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  if (local) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
}

export async function runMigrations(client: Client): Promise<void> {
  await client.execute(MIGRATION_TABLE);

  for (const migration of MIGRATIONS) {
    const transaction = await client.transaction("write");
    try {
      const applied = await transaction.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1",
        args: [migration.version]
      });
      if (applied.rows.length > 0) {
        await transaction.commit();
        continue;
      }

      for (const statement of migration.statements) {
        await transaction.execute(statement);
      }
      for (const statement of (await migration.prepare?.(transaction)) ?? []) {
        await transaction.execute(statement);
      }
      await transaction.execute({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        args: [migration.version, migration.name, new Date().toISOString()]
      });
      await transaction.commit();
    } catch (cause) {
      await transaction.rollback();
      throw cause;
    } finally {
      transaction.close();
    }
  }
}

export function latestMigrationVersion(): number {
  return MIGRATIONS.at(-1)?.version ?? 0;
}

async function columnNames(transaction: Transaction, table: string): Promise<Set<string>> {
  const result = await transaction.execute(`PRAGMA table_info(${table})`);
  return new Set(result.rows.map((row) => String(row.name)));
}
