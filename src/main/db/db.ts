import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolvePaths } from "../paths";

export type Db = Database.Database;

let cached: Db | null = null;

export function openDb(override?: { dataDir?: string }): Db {
  if (cached) return cached;

  const paths = resolvePaths(override);
  fs.mkdirSync(paths.dataDir, { recursive: true });

  const db = new Database(paths.dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  applySchema(db);

  cached = db;
  return db;
}

export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}

function applySchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      context TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail_markdown TEXT NOT NULL,
      resource_url TEXT,
      estimated_minutes INTEGER,
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_suggestions_goal_date ON suggestions(goal_id, date);
    CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date);

    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY,
      suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      rating TEXT CHECK (rating IN ('up', 'down')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reflections_suggestion ON reflections(suggestion_id);
  `);
}
