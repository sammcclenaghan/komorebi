import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { makeClient } from "../main/db/Db";
import {
  configureDatabase,
  latestMigrationVersion,
  runMigrations
} from "../main/db/migrations";
import { resolvePaths } from "../main/paths";
import { loadEnv } from "../server/env";

loadEnv();

const command = process.argv[2];
const argument = process.argv[3];

void main();

async function main(): Promise<void> {
  try {
    switch (command) {
      case "migrate":
        await migrate();
        break;
      case "integrity":
        await integrity();
        break;
      case "backup":
        await backup(argument);
        break;
      case "restore":
        await restore(argument);
        break;
      default:
        usage();
        process.exitCode = 2;
    }
  } catch (cause) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "database.command.failed",
        command,
        error: cause instanceof Error ? cause.message : String(cause)
      })
    );
    process.exitCode = 1;
  }
}

async function migrate(): Promise<void> {
  const client = makeClient();
  const local = !process.env.TURSO_DB_URL?.trim();
  try {
    await configureDatabase(client, local);
    await runMigrations(client);
    await configureDatabase(client, local);
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "database.migrated",
        version: latestMigrationVersion()
      })
    );
  } finally {
    client.close();
  }
}

async function integrity(): Promise<void> {
  const client = makeClient();
  try {
    await assertIntegrity(client);
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "database.integrity.ok"
      })
    );
  } finally {
    client.close();
  }
}

async function backup(destinationArgument?: string): Promise<void> {
  requireLocalDatabase("backup");
  const { dataDir, dbFile } = resolvePaths();
  const destination = path.resolve(
    destinationArgument ??
      path.join(dataDir, "backups", `komorebi-${fileTimestamp(new Date())}.db`)
  );
  if (destination === path.resolve(dbFile)) {
    throw new Error("Backup destination must differ from the live database.");
  }

  await assertDatabaseFile(dbFile, "Live database");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await assertMissing(destination);

  const client = createClient({ url: `file:${path.resolve(dbFile)}` });
  try {
    await client.execute(`VACUUM INTO '${escapeSqlString(destination)}'`);
  } finally {
    client.close();
  }

  const backupClient = createClient({ url: `file:${destination}` });
  try {
    await assertIntegrity(backupClient);
  } catch (cause) {
    await fs.rm(destination, { force: true });
    throw cause;
  } finally {
    backupClient.close();
  }

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "database.backup.created",
      destination
    })
  );
}

async function restore(sourceArgument?: string): Promise<void> {
  requireLocalDatabase("restore");
  if (!sourceArgument) {
    throw new Error("Restore requires the path to a backup file.");
  }

  const source = path.resolve(sourceArgument);
  const { dataDir, dbFile } = resolvePaths();
  const target = path.resolve(dbFile);
  if (source === target) {
    throw new Error("Restore source must differ from the live database.");
  }

  await assertDatabaseFile(source, "Restore source");
  const sourceClient = createClient({ url: `file:${source}` });
  try {
    await assertIntegrity(sourceClient);
    await assertKomorebiDatabase(sourceClient);
  } finally {
    sourceClient.close();
  }

  await fs.mkdir(dataDir, { recursive: true });
  const temporary = `${target}.restore-${randomUUID()}`;
  const rollback = `${target}.before-restore-${fileTimestamp(new Date())}`;
  await fs.copyFile(source, temporary);

  const temporaryClient = createClient({ url: `file:${temporary}` });
  try {
    await assertIntegrity(temporaryClient);
    await assertKomorebiDatabase(temporaryClient);
  } finally {
    temporaryClient.close();
  }

  let previousMoved = false;
  try {
    if (await exists(target)) {
      await fs.rename(target, rollback);
      previousMoved = true;
      await moveIfPresent(`${target}-wal`, `${rollback}-wal`);
      await moveIfPresent(`${target}-shm`, `${rollback}-shm`);
    }
    await fs.rename(temporary, target);
  } catch (cause) {
    await fs.rm(temporary, { force: true });
    if (previousMoved && !(await exists(target))) {
      await fs.rename(rollback, target);
      await moveIfPresent(`${rollback}-wal`, `${target}-wal`);
      await moveIfPresent(`${rollback}-shm`, `${target}-shm`);
    }
    throw cause;
  }

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "database.restore.completed",
      source,
      rollback: previousMoved ? rollback : undefined
    })
  );
}

async function assertIntegrity(client: Client): Promise<void> {
  const result = await client.execute("PRAGMA integrity_check");
  const failures = result.rows
    .map((row) => String(row.integrity_check ?? Object.values(row)[0]))
    .filter((value) => value.toLowerCase() !== "ok");
  if (failures.length > 0 || result.rows.length === 0) {
    throw new Error(`Integrity check failed: ${failures.join("; ") || "no result"}`);
  }
}

async function assertKomorebiDatabase(client: Client): Promise<void> {
  const result = await client.execute(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN ('goals', 'suggestions', 'settings')`
  );
  const names = new Set(result.rows.map((row) => String(row.name)));
  const missing = ["goals", "suggestions", "settings"].filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Not a Komorebi backup; missing tables: ${missing.join(", ")}`);
  }
}

function requireLocalDatabase(operation: string): void {
  if (process.env.TURSO_DB_URL?.trim()) {
    throw new Error(
      `${operation} is only available for the local database; use Turso's backup tooling for TURSO_DB_URL.`
    );
  }
}

async function assertMissing(file: string): Promise<void> {
  if (await exists(file)) {
    throw new Error(`Refusing to overwrite existing backup: ${file}`);
  }
}

async function assertDatabaseFile(file: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw new Error(`${label} does not exist: ${file}`);
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${label} is not a non-empty database file: ${file}`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function moveIfPresent(source: string, destination: string): Promise<void> {
  if (await exists(source)) await fs.rename(source, destination);
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function usage(): void {
  console.error(`Usage:
  database migrate
  database integrity
  database backup [destination.db]
  database restore <backup.db>`);
}
