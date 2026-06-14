import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";

let client: Client | null = null;
let schemaPromise: Promise<void> | null = null;

export async function getDb(): Promise<Client | null> {
  if (client) return client;
  const url = process.env.TURSO_DB_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  client = createClient({ url, authToken });
  if (!schemaPromise) {
    schemaPromise = initSchema();
  }
  await schemaPromise;
  return client;
}

async function initSchema(): Promise<void> {
  const db = client;
  if (!db) return;

  await db.batch([
    `CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      context TEXT,
      status TEXT NOT NULL DEFAULT 'active',
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
    )`
  ]);

  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)`,
    args: [
      JSON.stringify({
        schedule: { enabled: true, time: "07:00", lastRunDate: null },
        theme: "system"
      })
    ]
  });
}
