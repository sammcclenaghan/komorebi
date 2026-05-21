import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as dotenv from "dotenv";
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
import type { SuggestionRating, SuggestionStatus } from "~/shared/types";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

app.setName("Komorebi");

migrateLegacyUserData();
loadEnv();

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: "Komorebi",
    backgroundColor: "#fbfbf9",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(moduleDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(moduleDir, "..", "dist", "renderer", "index.html"));
  }

  routeExternalLinks(mainWindow);
}

/**
 * Send every http/https/mailto link the renderer tries to navigate to
 * out to the system default browser instead of opening it inside the
 * Electron window. Covers both `<a target="_blank">` (window.open path)
 * and plain `<a href>` (will-navigate path).
 */
function routeExternalLinks(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file://") || (devServerUrl ? url.startsWith(devServerUrl) : false);
    if (allowed) return;
    if (/^(https?|mailto):/.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
ipcMain.handle("goals:add", (_event, input: { title: string; description?: string; context?: string }) =>
  addGoal(input)
);
ipcMain.handle("goals:update", (_event, input: { id: string; updates: Parameters<typeof updateGoal>[1] }) =>
  updateGoal(input.id, input.updates)
);
ipcMain.handle("goals:delete", (_event, id: string) => deleteGoalCascade(id));

ipcMain.handle("checklist:today", () => getTodayChecklist());
ipcMain.handle("checklist:generate", () => generateTodayChecklist());

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

/**
 * The app was previously called "Goalpath", which set Electron's userData
 * dir to ~/Library/Application Support/Goalpath. After the rename to
 * Komorebi, that path becomes ~/Library/Application Support/Komorebi —
 * which is empty, so all goals/suggestions/reflections would vanish.
 *
 * If the legacy dir exists and the new one doesn't, rename it once. Runs
 * before any store reads.
 */
function migrateLegacyUserData(): void {
  try {
    const newDir = app.getPath("userData");
    const legacyDir = path.join(path.dirname(newDir), "Goalpath");
    if (fs.existsSync(legacyDir) && !fs.existsSync(newDir)) {
      fs.renameSync(legacyDir, newDir);
      console.log(`[migrate] moved ${legacyDir} → ${newDir}`);
    }
  } catch (err) {
    console.error("[migrate] userData rename failed (continuing):", err);
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
