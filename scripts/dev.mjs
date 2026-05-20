import { spawn, spawnSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");

const VITE_PORT = 5173;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const requiredBundles = [
  join(projectDir, "dist-electron", "main.cjs"),
  join(projectDir, "dist-electron", "preload.cjs")
];

const restartDebounceMs = 150;
const forcedShutdownTimeoutMs = 1500;
const childTreeGracePeriodMs = 800;

const childEnv = { ...process.env, VITE_DEV_SERVER_URL: VITE_URL };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let restartTimer = null;
let currentApp = null;
let restartQueue = Promise.resolve();
const expectedExits = new WeakSet();
const watchers = [];
const childProcesses = [];

function killChildTreeByPid(pid, signal) {
  if (process.platform === "win32" || typeof pid !== "number") return;
  spawnSync("pkill", [`-${signal}`, "-P", String(pid)], { stdio: "ignore" });
}

function spawnTracked(command, args, opts) {
  const child = spawn(command, args, { stdio: "inherit", cwd: projectDir, ...opts });
  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[goalpath] ${command} exited (code=${code} signal=${signal}). Shutting down.`);
    void shutdown(code ?? 1);
  });
  return child;
}

async function waitForBundles() {
  while (!shuttingDown) {
    if (requiredBundles.every((p) => existsSync(p))) return;
    await delay(150);
  }
}

async function waitForVite() {
  while (!shuttingDown) {
    try {
      const res = await fetch(VITE_URL, { method: "HEAD" });
      if (res.ok || res.status === 200 || res.status === 404) return;
    } catch {
      // not ready yet
    }
    await delay(200);
  }
}

function startApp() {
  if (shuttingDown || currentApp !== null) return;

  const app = spawn(electronPath, ["dist-electron/main.cjs"], {
    cwd: projectDir,
    env: childEnv,
    stdio: "inherit"
  });

  currentApp = app;

  app.once("error", (err) => {
    console.error("[goalpath] electron error:", err);
    if (currentApp === app) currentApp = null;
    if (!shuttingDown) scheduleRestart();
  });

  app.once("exit", (code, signal) => {
    if (currentApp === app) currentApp = null;
    const exitedAbnormally = signal !== null || (code !== 0 && code !== null);
    if (!shuttingDown && !expectedExits.has(app) && exitedAbnormally) {
      scheduleRestart();
    } else if (!shuttingDown && !expectedExits.has(app)) {
      // Normal quit (user closed window): tear down the whole dev stack.
      void shutdown(0);
    }
  });
}

async function stopApp() {
  const app = currentApp;
  if (!app) return;
  currentApp = null;
  expectedExits.add(app);

  await new Promise((resolveExit) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveExit();
    };
    app.once("exit", finish);
    app.kill("SIGTERM");
    killChildTreeByPid(app.pid, "TERM");
    setTimeout(() => {
      if (settled) return;
      app.kill("SIGKILL");
      killChildTreeByPid(app.pid, "KILL");
      finish();
    }, forcedShutdownTimeoutMs).unref();
  });
}

function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp();
        if (!shuttingDown) startApp();
      });
  }, restartDebounceMs);
}

function startBundleWatcher() {
  const dir = join(projectDir, "dist-electron");
  const watched = new Set(["main.cjs", "preload.cjs"]);
  const watcher = watch(dir, { persistent: true }, (_event, filename) => {
    if (typeof filename !== "string" || !watched.has(filename)) return;
    scheduleRestart();
  });
  watchers.push(watcher);
}

function killChildTree(signal) {
  if (process.platform === "win32") return;
  spawnSync("pkill", [`-${signal}`, "-P", String(process.pid)], { stdio: "ignore" });
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const w of watchers) w.close();
  await stopApp();

  for (const child of childProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }

  killChildTree("TERM");
  await delay(childTreeGracePeriodMs);
  killChildTree("KILL");

  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
process.once("SIGHUP", () => void shutdown(129));

// 1. Start vite + tsdown watcher in parallel.
spawnTracked("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"]);
spawnTracked("npx", ["tsdown", "--watch"]);

// 2. Wait for both before launching electron.
await Promise.all([waitForBundles(), waitForVite()]);

if (shuttingDown) process.exit(0);

startBundleWatcher();
startApp();
