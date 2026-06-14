import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/** Load .env files for the standalone web server (mirrors Electron main). */
export function loadEnv(): void {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(moduleDir, "..", "..", ".env.local"),
    path.join(moduleDir, "..", "..", ".env")
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      return;
    }
  }
}
