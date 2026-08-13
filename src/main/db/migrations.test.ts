import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { configureDatabase, latestMigrationVersion, runMigrations } from "./migrations";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("database migrations", () => {
  it("upgrades the legacy production schema and is idempotent", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "komorebi-migrations-"));
    temporaryDirectories.push(directory);
    const client = createClient({ url: `file:${path.join(directory, "legacy.db")}` });

    try {
      await client.batch(
        [
          `CREATE TABLE goals (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, context TEXT,
            status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )`,
          `CREATE TABLE suggestions (
            id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL,
            summary TEXT NOT NULL, detail_markdown TEXT NOT NULL, resource_url TEXT,
            estimated_minutes INTEGER, status TEXT NOT NULL DEFAULT 'pending', rating TEXT,
            created_at TEXT NOT NULL, completed_at TEXT
          )`
        ],
        "write"
      );

      await configureDatabase(client, true);
      await runMigrations(client);
      await runMigrations(client);
      await configureDatabase(client, true);

      const migrations = await client.execute(
        "SELECT version FROM schema_migrations ORDER BY version"
      );
      const goals = await client.execute("PRAGMA table_info(goals)");
      const suggestions = await client.execute("PRAGMA table_info(suggestions)");
      const journalMode = await client.execute("PRAGMA journal_mode");
      const busyTimeout = await client.execute("PRAGMA busy_timeout");

      expect(migrations.rows.map((row) => Number(row.version))).toEqual(
        Array.from({ length: latestMigrationVersion() }, (_, index) => index + 1)
      );
      expect(goals.rows.map((row) => row.name)).toContain("priority");
      expect(suggestions.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining(["generation_warning", "path_id", "milestone_id"])
      );
      expect(String(journalMode.rows[0]?.journal_mode).toLowerCase()).toBe("wal");
      expect(Number(busyTimeout.rows[0]?.timeout)).toBe(5000);
    } finally {
      client.close();
    }
  });
});
