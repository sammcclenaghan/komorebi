import fs from "node:fs/promises";
import path from "node:path";
import { resolvePaths } from "../paths";

/**
 * Generic atomic JSON file store. Reads/writes a single JSON file per
 * collection. Write-tmp-then-rename so a crash mid-write can't corrupt
 * the existing file.
 *
 * In-memory cache means subsequent reads in the same process are free.
 * The cache invalidates on every write, which is fine for our scale
 * (single process, single user, low frequency).
 */
export type Store<T> = {
  load: () => Promise<T>;
  save: (data: T) => Promise<void>;
  /** Read-modify-write helper that serializes concurrent updates. */
  mutate: <R>(fn: (current: T) => Promise<{ next: T; result: R }> | { next: T; result: R }) => Promise<R>;
};

export function makeStore<T>(filename: string, defaultValue: () => T): Store<T> {
  let cache: T | null = null;
  let inflight: Promise<unknown> = Promise.resolve();

  async function readFromDisk(): Promise<T> {
    const { dataDir } = resolvePaths();
    const file = path.join(dataDir, filename);
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultValue();
      throw err;
    }
  }

  async function writeToDisk(data: T): Promise<void> {
    const { dataDir } = resolvePaths();
    await fs.mkdir(dataDir, { recursive: true });
    const file = path.join(dataDir, filename);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, file);
  }

  return {
    async load() {
      if (cache !== null) return cache;
      cache = await readFromDisk();
      return cache;
    },
    async save(data) {
      await writeToDisk(data);
      cache = data;
    },
    async mutate(fn) {
      const next = inflight.then(async () => {
        const current = cache ?? (await readFromDisk());
        const result = await fn(current);
        await writeToDisk(result.next);
        cache = result.next;
        return result.result;
      });
      inflight = next.catch(() => undefined);
      return next as Promise<ReturnType<typeof fn> extends Promise<{ result: infer R }> ? R : ReturnType<typeof fn> extends { result: infer R } ? R : never>;
    }
  };
}
