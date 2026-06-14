import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env";
import { startServer } from "./http";

loadEnv();

const port = Number(process.env.PORT ?? process.env.KOMOREBI_PORT ?? 3847);
const host = process.env.KOMOREBI_HOST ?? "0.0.0.0";
const apiToken = process.env.KOMOREBI_API_TOKEN?.trim() || undefined;

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const staticDir = path.join(moduleDir, "..", "..", "dist", "renderer");

startServer({ port, host, staticDir, apiToken });
