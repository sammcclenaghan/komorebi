import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, ipcMain } from "electron";
import * as dotenv from "dotenv";
import { createMainWindow, showMainWindow } from "./window";
import {
  awaitConnect,
  beginConnect,
  disconnectIntegration,
  getIntegrations,
  refreshConnections
} from "./integrations/service";
import { getCurrentWeather } from "./weather/service";
import { addGoal, listGoals, updateGoal } from "./store/goals";
import {
  deleteGoalCascade,
  generateTodayChecklist,
  getHistory,
  getTodayChecklist,
  regenerateTodayChecklist,
  skipAndRegenerate
} from "./checklist/orchestrator";
import {
  getSuggestion,
  updateSuggestionRating,
  updateSuggestionStatus
} from "./store/suggestions";
import {
  addReflection,
  listReflectionsForSuggestion
} from "./store/reflections";
import { fetchLinkPreview } from "./links/preview";
import { getSettings, updateSettings, type SettingsUpdate } from "./store/settings";
import { rescheduleScheduler, startScheduler } from "./scheduler/scheduler";
import { initTray } from "./tray/tray";
import type { SuggestionRating, SuggestionStatus } from "~/shared/types";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

app.setName("Komorebi");

setupFileLogging();
loadEnv();

if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
}

app.whenReady().then(() => {
  createMainWindow();
  initTray();
  startScheduler();
  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("integrations:list", () => getIntegrations());
ipcMain.handle("integrations:refresh", () => refreshConnections());
ipcMain.handle("integrations:begin-connect", (_event, slug: string) => beginConnect(slug));
ipcMain.handle("integrations:await-connect", (_event, slug: string) => awaitConnect(slug));
ipcMain.handle("integrations:disconnect", (_event, slug: string) => disconnectIntegration(slug));

ipcMain.handle("goals:list", () => listGoals());
ipcMain.handle("goals:add", (_event, input: Parameters<typeof addGoal>[0]) =>
  addGoal(input)
);
ipcMain.handle("goals:update", (_event, input: { id: string; updates: Parameters<typeof updateGoal>[1] }) =>
  updateGoal(input.id, input.updates)
);
ipcMain.handle("goals:delete", (_event, id: string) => deleteGoalCascade(id));

ipcMain.handle("checklist:today", () => getTodayChecklist());
ipcMain.handle("checklist:generate", () => generateTodayChecklist());
ipcMain.handle("checklist:regenerate", () => regenerateTodayChecklist());

ipcMain.handle("history:list", (_event, daysBack?: number) => getHistory(daysBack));

ipcMain.handle("suggestion:get", (_event, id: string) => getSuggestion(id));
ipcMain.handle("suggestion:set-status", (_event, input: { id: string; status: SuggestionStatus }) =>
  updateSuggestionStatus(input.id, input.status)
);
ipcMain.handle("suggestion:set-rating", (_event, input: { id: string; rating: SuggestionRating }) =>
  updateSuggestionRating(input.id, input.rating)
);
ipcMain.handle("suggestion:skip-regenerate", (_event, id: string) => skipAndRegenerate(id));

ipcMain.handle("reflection:list", (_event, suggestionId: string) =>
  listReflectionsForSuggestion(suggestionId)
);
ipcMain.handle("reflection:add", (_event, input: { suggestionId: string; text: string; rating?: "up" | "down" | null }) =>
  addReflection(input)
);

ipcMain.handle("weather:current", (_event, location: string) => getCurrentWeather(location));

ipcMain.handle("link:preview", (_event, url: string) => fetchLinkPreview(url));

ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:update", async (_event, update: SettingsUpdate) => {
  const next = await updateSettings(update);
  // Only reschedule when the schedule actually changed; theme-only updates
  // shouldn't bounce timers.
  if ("enabled" in update || "time" in update) {
    await rescheduleScheduler();
  }
  return next;
});

/**
 * When running from a packaged .app there's no terminal to print to.
 * Mirror console output to a rotating-by-launch file in userData/logs
 * so we can actually debug what's going on with the AI, integrations,
 * etc. In dev, do nothing — the terminal already has it.
 *
 * Tail with:
 *   tail -f "$HOME/Library/Application Support/Komorebi/logs/main.log"
 */
function setupFileLogging(): void {
  if (!app.isPackaged) return;
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const stream = fs.createWriteStream(path.join(logDir, "main.log"), { flags: "a" });
    stream.write(`\n=== launch ${new Date().toISOString()} ===\n`);

    const fmt = (args: unknown[]): string =>
      args
        .map((a) => {
          if (a instanceof Error) return a.stack ?? a.message;
          if (typeof a === "string") return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");

    const wrap = (orig: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        stream.write(`[${new Date().toISOString()}] ${fmt(args)}\n`);
        orig(...args);
      };

    console.log = wrap(console.log);
    console.warn = wrap(console.warn);
    console.error = wrap(console.error);

    process.on("uncaughtException", (err) => {
      stream.write(`[${new Date().toISOString()}] uncaught: ${err.stack ?? err.message}\n`);
    });
    process.on("unhandledRejection", (reason) => {
      const text = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
      stream.write(`[${new Date().toISOString()}] unhandled rejection: ${text}\n`);
    });
  } catch (err) {
    console.error("[logging] setup failed:", err);
  }
}

/**
 * Load env vars. Lookup order depends on whether we're in dev or
 * running from a packaged .app:
 *
 * dev → project root .env.local / .env (loaded by Vite + here for symmetry)
 * packaged → ~/Library/Application Support/Komorebi/.env (user override)
 *            then the .env.local that was bundled into the .app at build
 *            time via electron-builder extraResources.
 *
 * Failure is non-fatal — features that need a key will surface their own
 * errors when used.
 */
function loadEnv(): void {
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(path.join(app.getPath("userData"), ".env"));
    candidates.push(path.join(process.resourcesPath, ".env.local"));
    candidates.push(path.join(process.resourcesPath, ".env"));
  } else {
    candidates.push(path.join(process.cwd(), ".env.local"));
    candidates.push(path.join(process.cwd(), ".env"));
    candidates.push(path.join(moduleDir, "..", ".env.local"));
    candidates.push(path.join(moduleDir, "..", ".env"));
  }
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      return;
    }
  }
}
