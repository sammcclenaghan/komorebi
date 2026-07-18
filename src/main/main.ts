/**
 * Electron entry point. The business logic lives in Effect services behind
 * src/main/runtime.ts; this file is only the shell: window, tray, scheduler,
 * IPC registration, logging, env loading.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import * as dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { disposeRuntime } from "./runtime";
import { startScheduler } from "./scheduler";
import { initTray } from "./tray";
import { createMainWindow, showMainWindow } from "./window";

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

registerIpcHandlers();

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

app.on("will-quit", () => {
  void disposeRuntime();
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
