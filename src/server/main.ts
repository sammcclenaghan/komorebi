import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { disposeRuntime } from "~/main/runtime";
import { loadEnv } from "./env";
import { startServer } from "./http";
import { errorFields, log } from "./log";

// Prefer IPv4 for outbound connections in hosted/self-hosted environments that lack working
// IPv6 egress, so Node's default Happy Eyeballs (IPv6-first) makes outbound
// fetch (weather, Ollama, …) hang until ETIMEDOUT. ipv4first avoids that.
dns.setDefaultResultOrder("ipv4first");

loadEnv();

const port = Number(process.env.PORT ?? process.env.KOMOREBI_PORT ?? 3847);
const host = process.env.KOMOREBI_HOST ?? "0.0.0.0";
const apiToken = process.env.KOMOREBI_API_TOKEN?.trim() || undefined;

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const staticDir = path.join(moduleDir, "..", "dist", "renderer");

const server = startServer({ port, host, staticDir, apiToken });
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "server.shutdown.started", { signal });

  const forcedExit = setTimeout(() => {
    log("error", "server.shutdown.timed_out", { signal });
    process.exit(1);
  }, 25_000);
  forcedExit.unref();

  server.closeIdleConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disposeRuntime();
  clearTimeout(forcedExit);
  log("info", "server.shutdown.completed", { signal });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .then(() => {
        process.exitCode = 0;
      })
      .catch((err) => {
        log("error", "server.shutdown.failed", { signal, ...errorFields(err) });
        process.exitCode = 1;
      });
  });
}
