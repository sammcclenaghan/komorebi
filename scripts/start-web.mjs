import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");

const result = spawnSync("node", ["dist-server/main.cjs"], {
  cwd: projectDir,
  stdio: "inherit",
  env: {
    ...process.env,
    KOMOREBI_HOST: process.env.KOMOREBI_HOST ?? "0.0.0.0"
  }
});

process.exit(result.status ?? 1);
