import { Effect } from "effect";
import {
  defaultSettings,
  type AppSettings,
  type ScheduleSettings,
  type Theme
} from "~/shared/schema";
import type { SettingsUpdate } from "~/shared/api";
import { Db, DbError } from "../db/Db";

/** Keep model tags short and on a single line; trim/clamp pasted junk. */
const MAX_MODEL_LENGTH = 120;

const VALID_THEMES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

function freshDefaults(): AppSettings {
  return {
    schedule: { ...defaultSettings.schedule },
    theme: defaultSettings.theme,
    model: defaultSettings.model
  };
}

/** Normalize a model tag: trim, clamp, and treat blank as "use default". */
function normalizeModel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_MODEL_LENGTH);
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeTheme(input: unknown): Theme {
  return typeof input === "string" && VALID_THEMES.has(input)
    ? (input as Theme)
    : defaultSettings.theme;
}

function normalizeTime(input: string): string {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return defaultSettings.schedule.time;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalize(raw: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    schedule: { ...defaultSettings.schedule, ...(raw?.schedule ?? {}) },
    theme: normalizeTheme(raw?.theme),
    model: normalizeModel(raw?.model)
  };
}

export class SettingsRepo extends Effect.Service<SettingsRepo>()("SettingsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const get = (): Effect.Effect<AppSettings, DbError> =>
      db.rows("SELECT data FROM settings WHERE id = 1").pipe(
        Effect.map((rows) => {
          const data = rows[0]?.data;
          if (typeof data !== "string") return freshDefaults();
          try {
            return normalize(JSON.parse(data) as Partial<AppSettings>);
          } catch {
            return freshDefaults();
          }
        })
      );

    const persist = (next: AppSettings): Effect.Effect<AppSettings, DbError> =>
      db
        .execute(
          "INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data",
          [JSON.stringify(next)]
        )
        .pipe(Effect.as(next));

    const update = (patch: SettingsUpdate): Effect.Effect<AppSettings, DbError> =>
      get().pipe(
        Effect.flatMap((current) => {
          const schedulePatch = patch.schedule ?? {};
          const schedule: ScheduleSettings = {
            ...current.schedule,
            ...(schedulePatch.enabled !== undefined ? { enabled: schedulePatch.enabled } : {}),
            ...(schedulePatch.time !== undefined
              ? { time: normalizeTime(schedulePatch.time) }
              : {}),
            ...(schedulePatch.lastRunDate !== undefined
              ? { lastRunDate: schedulePatch.lastRunDate }
              : {})
          };
          const next: AppSettings = {
            schedule,
            theme: patch.theme !== undefined ? normalizeTheme(patch.theme) : current.theme,
            model: patch.model !== undefined ? normalizeModel(patch.model) : current.model
          };
          return persist(next);
        })
      );

    const markScheduledRun = (date: string): Effect.Effect<void, DbError> =>
      update({ schedule: { lastRunDate: date } }).pipe(Effect.asVoid);

    return { get, update, markScheduledRun } as const;
  })
}) {}
