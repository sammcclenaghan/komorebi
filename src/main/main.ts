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
