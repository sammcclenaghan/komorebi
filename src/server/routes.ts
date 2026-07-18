/**
 * HTTP mirror of the IPC contract. Every route delegates to the shared
 * Effect-backed handler map (src/main/api/handlers.ts), so web-server
 * behavior is identical to the Electron app by construction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handlers } from "~/main/api/handlers";
import type { GoalAddInput, GoalUpdateInput, SettingsUpdate } from "~/shared/api";
import type { SuggestionRating, SuggestionStatus } from "~/shared/schema";

const appVersion = readAppVersion();

function readAppVersion(): string {
  try {
    const moduleDir =
      typeof __dirname === "string"
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      fs.readFileSync(path.join(moduleDir, "..", "..", "package.json"), "utf8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return process.env.npm_package_version ?? "0.0.0";
  }
}

export async function handleApi(
  method: string,
  pathname: string,
  search: string,
  body: unknown
): Promise<unknown> {
  if (method === "GET" && pathname === "/api/version") {
    return appVersion;
  }

  if (method === "GET" && pathname === "/api/integrations") return handlers.integrations.list();
  if (method === "POST" && pathname === "/api/integrations/refresh") {
    return handlers.integrations.refresh();
  }

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/connect")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/connect".length));
    return handlers.integrations.beginConnect(slug);
  }

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/await")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/await".length));
    return handlers.integrations.awaitConnect(slug);
  }

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/disconnect")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/disconnect".length));
    await handlers.integrations.disconnect(slug);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/goals") return handlers.goals.list();
  if (method === "POST" && pathname === "/api/goals") {
    return handlers.goals.add(body as GoalAddInput);
  }
  if (method === "PATCH" && pathname.startsWith("/api/goals/")) {
    const id = decodeURIComponent(pathname.slice("/api/goals/".length));
    const input = body as { updates: GoalUpdateInput["updates"] };
    return handlers.goals.update({ id, updates: input.updates });
  }
  if (method === "DELETE" && pathname.startsWith("/api/goals/")) {
    const id = decodeURIComponent(pathname.slice("/api/goals/".length));
    await handlers.goals.delete(id);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/checklist/today") return handlers.checklist.today();
  if (method === "POST" && pathname === "/api/checklist/generate") {
    return handlers.checklist.generate();
  }
  if (method === "POST" && pathname === "/api/checklist/regenerate") {
    return handlers.checklist.regenerate();
  }
  if (method === "POST" && pathname.startsWith("/api/checklist/retry/")) {
    const goalId = decodeURIComponent(pathname.slice("/api/checklist/retry/".length));
    return handlers.checklist.retryGoal(goalId);
  }

  if (method === "GET" && pathname === "/api/history") {
    const params = new URLSearchParams(search);
    const daysBack = params.has("daysBack") ? Number(params.get("daysBack")) : undefined;
    return handlers.history.list(daysBack);
  }

  if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/status")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length, -"/status".length));
    const input = body as { status: SuggestionStatus };
    return handlers.suggestions.setStatus({ id, status: input.status });
  }
  if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/rating")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length, -"/rating".length));
    const input = body as { rating: SuggestionRating };
    return handlers.suggestions.setRating({ id, rating: input.rating });
  }
  if (
    method === "POST" &&
    pathname.startsWith("/api/suggestions/") &&
    pathname.endsWith("/skip-regenerate")
  ) {
    const id = decodeURIComponent(
      pathname.slice("/api/suggestions/".length, -"/skip-regenerate".length)
    );
    const input = (body ?? {}) as { reason?: string };
    return handlers.suggestions.skipAndRegenerate(id, input.reason);
  }
  if (
    method === "POST" &&
    pathname.startsWith("/api/suggestions/") &&
    pathname.endsWith("/regenerate")
  ) {
    const id = decodeURIComponent(
      pathname.slice("/api/suggestions/".length, -"/regenerate".length)
    );
    const input = (body ?? {}) as { note?: string };
    return handlers.suggestions.regenerate(id, input.note);
  }
  if (method === "GET" && pathname.startsWith("/api/suggestions/")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length));
    return handlers.suggestions.get(id);
  }

  if (method === "GET" && pathname.startsWith("/api/reflections/")) {
    const suggestionId = decodeURIComponent(pathname.slice("/api/reflections/".length));
    return handlers.reflections.list(suggestionId);
  }
  if (method === "POST" && pathname === "/api/reflections") {
    return handlers.reflections.add(
      body as { suggestionId: string; text: string; rating?: "up" | "down" | null }
    );
  }

  if (method === "GET" && pathname === "/api/weather/current") {
    const params = new URLSearchParams(search);
    const location = params.get("location") ?? "";
    return handlers.weather.current(location);
  }

  if (method === "GET" && pathname === "/api/links/preview") {
    const params = new URLSearchParams(search);
    const target = params.get("url") ?? "";
    return handlers.links.preview(target);
  }

  if (method === "GET" && pathname === "/api/settings") return handlers.settings.get();
  if (method === "PATCH" && pathname === "/api/settings") {
    return handlers.settings.update(body as SettingsUpdate);
  }

  throw new RouteNotFoundError();
}

export class RouteNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "RouteNotFoundError";
  }
}
