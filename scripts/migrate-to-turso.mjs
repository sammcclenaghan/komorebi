import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, "..");

dotenv.config({ path: join(projectDir, ".env.local") });
dotenv.config({ path: join(projectDir, ".env") });

const url = process.env.TURSO_DB_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_DB_URL and TURSO_AUTH_TOKEN in .env.local");
  process.exit(1);
}

const dataDir = process.env.KOMOREBI_DATA_DIR || (
  process.platform === "darwin"
    ? join(os.homedir(), "Library", "Application Support", "Komorebi", "data")
    : join(os.homedir(), ".komorebi")
);

function readJSON(filename) {
  const file = join(dataDir, filename);
  if (!existsSync(file)) {
    console.log(`  [skip] ${filename} — not found`);
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const db = createClient({ url, authToken });

console.log("Connected to Turso");

console.log("\nEnsuring schema...");
await db.batch([
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, context TEXT,
    status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, date TEXT NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, detail_markdown TEXT NOT NULL,
    resource_url TEXT, estimated_minutes INTEGER, status TEXT NOT NULL DEFAULT 'pending',
    rating TEXT, created_at TEXT NOT NULL, completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS reflections (
    id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL, text TEXT NOT NULL,
    rating TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1, data TEXT NOT NULL
  )`
]);

const goals = readJSON("goals.json");
if (goals && goals.length > 0) {
  console.log(`\nMigrating ${goals.length} goals...`);
  let count = 0;
  for (const g of goals) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO goals (id, title, description, context, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [g.id, g.title, g.description, g.context, g.status, g.createdAt, g.updatedAt]
      });
      count++;
    } catch (err) {
      console.error(`  Error inserting goal ${g.id}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} goals`);
}

const suggestions = readJSON("suggestions.json");
if (suggestions && suggestions.length > 0) {
  console.log(`\nMigrating ${suggestions.length} suggestions...`);
  let count = 0;
  for (const s of suggestions) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO suggestions (id, goal_id, date, title, summary, detail_markdown, resource_url, estimated_minutes, status, rating, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.id, s.goalId, s.date, s.title, s.summary, s.detailMarkdown,
          s.resourceUrl, s.estimatedMinutes, s.status, s.rating,
          s.createdAt, s.completedAt
        ]
      });
      count++;
    } catch (err) {
      console.error(`  Error inserting suggestion ${s.id}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} suggestions`);
}

const reflections = readJSON("reflections.json");
if (reflections && reflections.length > 0) {
  console.log(`\nMigrating ${reflections.length} reflections...`);
  let count = 0;
  for (const r of reflections) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO reflections (id, suggestion_id, text, rating, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [r.id, r.suggestionId, r.text, r.rating, r.createdAt]
      });
      count++;
    } catch (err) {
      console.error(`  Error inserting reflection ${r.id}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} reflections`);
}

const settings = readJSON("settings.json");
if (settings) {
  console.log("\nMigrating settings...");
  await db.execute({
    sql: `INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)`,
    args: [JSON.stringify(settings)]
  });
  console.log("  Settings migrated");
}

console.log("\nDone!");
db.close();
