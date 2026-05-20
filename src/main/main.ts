import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import * as dotenv from "dotenv";
import {
  awaitConnect,
  beginConnect,
  disconnectIntegration,
  getIntegrations,
  refreshConnections
} from "./integrations/service";
import { addGoal, deleteGoal, listGoals, updateGoal } from "./store/goals";
import {
  generateTodayChecklist,
  getTodayChecklist
} from "./checklist/orchestrator";
import {
  getSuggestion,
  updateSuggestionStatus
} from "./store/suggestions";
import {
  addReflection,
  listReflectionsForSuggestion
} from "./store/reflections";
import type { SuggestionStatus } from "~/shared/types";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

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
    title: "Goalpath",
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
ipcMain.handle("goals:delete", (_event, id: string) => deleteGoal(id));

ipcMain.handle("checklist:today", () => getTodayChecklist());
ipcMain.handle("checklist:generate", () => generateTodayChecklist());

ipcMain.handle("suggestion:get", (_event, id: string) => getSuggestion(id));
ipcMain.handle("suggestion:set-status", (_event, input: { id: string; status: SuggestionStatus }) =>
  updateSuggestionStatus(input.id, input.status)
);

ipcMain.handle("reflection:list", (_event, suggestionId: string) =>
  listReflectionsForSuggestion(suggestionId)
);
ipcMain.handle("reflection:add", (_event, input: { suggestionId: string; text: string; rating?: "up" | "down" | null }) =>
  addReflection(input)
);

/**
 * Load .env.local from the project root in dev, and from the app resources
 * dir in production. Failure is non-fatal — features that need the env will
 * surface their own errors.
 */
function loadEnv(): void {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(moduleDir, "..", ".env.local"),
    path.join(moduleDir, "..", ".env")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      return;
    }
  }
}
