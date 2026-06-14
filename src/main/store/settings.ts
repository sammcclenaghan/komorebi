import { getDb } from "./db";
import { makeStore } from "./file-store";
import type { AppSettings, ScheduleSettings, Theme } from "~/shared/types";

const DEFAULTS: AppSettings = {
  schedule: {
    enabled: true,
    time: "07:00",
    lastRunDate: null
  },
  theme: "system"
};

const VALID_THEMES: ReadonlySet<Theme> = new Set<Theme>(["light", "dark", "system"]);

const store = makeStore<AppSettings>("settings.json", () => structuredCloneDefaults());

function structuredCloneDefaults(): AppSettings {
  return { schedule: { ...DEFAULTS.schedule }, theme: DEFAULTS.theme };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute("SELECT data FROM settings WHERE id = 1");
    if (rs.rows.length === 0) return structuredCloneDefaults();
    const raw = JSON.parse((rs.rows[0] as Record<string, unknown>).data as string) as Partial<AppSettings>;
    return {
      schedule: { ...DEFAULTS.schedule, ...(raw?.schedule ?? {}) },
      theme: normalizeTheme(raw?.theme)
    };
  }

  const raw = await store.load();
  return {
    schedule: { ...DEFAULTS.schedule, ...(raw?.schedule ?? {}) },
    theme: normalizeTheme(raw?.theme)
  };
}

export type SettingsUpdate = Partial<Pick<ScheduleSettings, "enabled" | "time">> & {
  theme?: Theme;
};

export async function updateSettings(update: SettingsUpdate): Promise<AppSettings> {
  const db = await getDb();
  if (db) {
    const current = await getSettings();
    const schedule: ScheduleSettings = {
      ...DEFAULTS.schedule,
      ...current.schedule,
      ...("enabled" in update && update.enabled !== undefined ? { enabled: update.enabled } : {}),
      ...("time" in update && update.time ? { time: normalizeTime(update.time) } : {})
    };
    const theme: Theme =
      update.theme !== undefined ? normalizeTheme(update.theme) : normalizeTheme(current.theme);
    const next: AppSettings = { schedule, theme };
    await db.execute({
      sql: "UPDATE settings SET data = ? WHERE id = 1",
      args: [JSON.stringify(next)]
    });
    return next;
  }

  return store.mutate((current) => {
    const base = current ?? structuredCloneDefaults();
    const schedule: ScheduleSettings = {
      ...DEFAULTS.schedule,
      ...base.schedule,
      ...("enabled" in update && update.enabled !== undefined ? { enabled: update.enabled } : {}),
      ...("time" in update && update.time ? { time: normalizeTime(update.time) } : {})
    };
    const theme: Theme =
      update.theme !== undefined ? normalizeTheme(update.theme) : normalizeTheme(base.theme);
    const next: AppSettings = { ...base, schedule, theme };
    return { next, result: next };
  });
}

export async function markScheduledRun(date: string): Promise<void> {
  const db = await getDb();
  if (db) {
    const current = await getSettings();
    const next: AppSettings = {
      ...current,
      schedule: { ...DEFAULTS.schedule, ...current.schedule, lastRunDate: date }
    };
    await db.execute({
      sql: "UPDATE settings SET data = ? WHERE id = 1",
      args: [JSON.stringify(next)]
    });
    return;
  }

  await store.mutate((current) => {
    const base = current ?? structuredCloneDefaults();
    const next: AppSettings = {
      ...base,
      theme: normalizeTheme(base.theme),
      schedule: { ...DEFAULTS.schedule, ...base.schedule, lastRunDate: date }
    };
    return { next, result: undefined };
  });
}

function normalizeTime(input: string): string {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULTS.schedule.time;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeTheme(input: unknown): Theme {
  return typeof input === "string" && VALID_THEMES.has(input as Theme)
    ? (input as Theme)
    : DEFAULTS.theme;
}
