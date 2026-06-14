import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { subscribeProgress } from "~/main/progress";
import { handleApi, RouteNotFoundError } from "./routes";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

export type ServerOptions = {
  port: number;
  host: string;
  staticDir?: string;
  apiToken?: string;
};

export function createServer(options: ServerOptions): http.Server {
  const staticDir = options.staticDir ?? path.join(moduleDir, "..", "..", "dist", "renderer");

  return http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400).end();
        return;
      }

      const url = new URL(req.url, "http://local");
      const pathname = url.pathname;

      if (req.method === "OPTIONS") {
        writeCors(res);
        res.writeHead(204).end();
        return;
      }

      if (pathname === "/api/checklist/progress") {
        if (!authorize(req, options.apiToken, url)) {
          res.writeHead(401).end("Unauthorized");
          return;
        }
        handleProgressStream(req, res);
        return;
      }

      if (pathname.startsWith("/api/")) {
        if (!authorize(req, options.apiToken, url)) {
          res.writeHead(401, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: "Unauthorized" })
          );
          return;
        }

        writeCors(res);
        const method = req.method ?? "GET";
        let body: unknown = undefined;

        if (method !== "GET" && method !== "HEAD") {
          body = await readJsonBody(req);
        }

        try {
          const result = await handleApi(method, pathname, url.search, body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          if (err instanceof RouteNotFoundError) {
            res.writeHead(404, { "Content-Type": "application/json" }).end(
              JSON.stringify({ error: "Not found" })
            );
            return;
          }
          console.error("[server] API error:", err);
          const message = err instanceof Error ? err.message : "Internal error";
          res.writeHead(500, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: message })
          );
        }
        return;
      }

      if (options.staticDir) {
        await serveStatic(req, res, staticDir, pathname);
        return;
      }

      res.writeHead(404).end("Not found");
    } catch (err) {
      console.error("[server] request failed:", err);
      if (!res.headersSent) res.writeHead(500).end("Internal error");
    }
  });
}

function authorize(req: http.IncomingMessage, token?: string, url?: URL): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  if (header === `Bearer ${token}`) return true;
  if (url?.searchParams.get("token") === token) return true;
  return false;
}

function writeCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function handleProgressStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  writeCors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.write(": connected\n\n");

  const unsubscribe = subscribeProgress((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as unknown;
}

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  staticDir: string,
  pathname: string
): Promise<void> {
  writeCors(res);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(staticDir, safePath);

  if (!filePath.startsWith(staticDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await sendFile(res, path.join(filePath, "index.html"));
      return;
    }
    await sendFile(res, filePath);
  } catch {
    // SPA fallback — client-side routes reload as /today etc.
    try {
      await sendFile(res, path.join(staticDir, "index.html"));
    } catch {
      res.writeHead(404).end("Not found");
    }
  }
}

async function sendFile(res: http.ServerResponse, filePath: string): Promise<void> {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(data);
}

export function startServer(options: ServerOptions): http.Server {
  const server = createServer(options);
  server.listen(options.port, options.host, () => {
    const hostLabel = options.host === "0.0.0.0" ? "localhost" : options.host;
    console.log(`[komorebi] web server listening on http://${hostLabel}:${options.port}`);
    if (options.host === "0.0.0.0") {
      console.log("[komorebi] reachable on your LAN — open this URL on your phone");
    }
    if (options.apiToken) {
      console.log("[komorebi] API token required (Authorization: Bearer …)");
    }
  });
  return server;
}
