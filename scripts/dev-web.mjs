import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");

const VITE_PORT = 5173;
const API_PORT = Number(process.env.KOMOREBI_PORT ?? 3847);
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;

const requiredBundle = join(projectDir, "dist-server", "main.cjs");

const childEnv = {
  ...process.env,
  KOMOREBI_WEB: "1",
  KOMOREBI_PORT: String(API_PORT)
};

let shuttingDown = false;
const childProcesses = [];

function localIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

function spawnTracked(command, args, opts) {
  const child = spawn(command, args, { stdio: "inherit", cwd: projectDir, ...opts });
  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[komorebi] ${command} exited (code=${code} signal=${signal}). Shutting down.`);
    void shutdown(code ?? 1);
  });
  return child;
}

async function waitForBundle() {
  while (!shuttingDown) {
    if (existsSync(requiredBundle)) return;
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

async function waitForApi() {
  while (!shuttingDown) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await delay(200);
  }
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of childProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

spawnTracked("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], { env: childEnv });
spawnTracked("npx", ["tsdown", "--watch"], { env: childEnv });

await waitForBundle();
if (shuttingDown) process.exit(0);

spawnTracked("node", ["dist-server/main.cjs"], { env: childEnv });

await Promise.all([waitForVite(), waitForApi()]);
if (shuttingDown) process.exit(0);

const ip = localIp();
console.log("\n[komorebi] Web dev ready");
console.log(`  Desktop:  ${VITE_URL}`);
if (ip) console.log(`  Phone:    http://${ip}:${VITE_PORT}`);
console.log(`  API:      http://127.0.0.1:${API_PORT}\n`);
