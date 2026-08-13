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

function recordBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a JSON object body.");
  }
  return body as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
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

  if (method === "POST" && pathname === "/api/generation/checklist") {
    const input = recordBody(body);
    return handlers.generation.enqueueChecklist(requiredString(input.requestId, "requestId"));
  }
  if (method === "GET" && pathname === "/api/generation/jobs") {
    const params = new URLSearchParams(search);
    const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
    return handlers.generation.recentJobs(
      typeof limit === "number" && Number.isInteger(limit) ? limit : undefined
    );
  }

  if (method === "GET" && pathname === "/api/goals") return handlers.goals.list();
  const pathGet = pathname.match(/^\/api\/goals\/([^/]+)\/path$/);
  if (pathGet?.[1] && method === "GET") {
    return handlers.paths.get(decodeURIComponent(pathGet[1]));
  }
  const pathGenerate = pathname.match(/^\/api\/goals\/([^/]+)\/path\/generate$/);
  if (pathGenerate?.[1] && method === "POST") {
    return handlers.paths.generate(decodeURIComponent(pathGenerate[1]));
  }
  const activate = pathname.match(/^\/api\/paths\/([^/]+)\/activate$/);
  if (activate?.[1] && method === "POST") {
    const input = recordBody(body);
    return handlers.paths.activate({
      pathId: decodeURIComponent(activate[1]),
      expectedRevision: requiredNumber(input.expectedRevision, "expectedRevision")
    });
  }
  const complete = pathname.match(/^\/api\/paths\/([^/]+)\/complete-milestone$/);
  if (complete?.[1] && method === "POST") {
    const input = recordBody(body);
    return handlers.paths.completeMilestone({
      pathId: decodeURIComponent(complete[1]),
      milestoneId: requiredString(input.milestoneId, "milestoneId"),
      evidence: requiredString(input.evidence, "evidence"),
      expectedRevision: requiredNumber(input.expectedRevision, "expectedRevision")
    });
  }
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
  if (method === "GET" && pathname === "/api/checklist/stats") return handlers.checklist.stats();
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

  if (method === "GET" && pathname === "/api/coach/memory") return handlers.coach.memory();
  if (method === "GET" && pathname === "/api/coach/weekly-check-in") {
    return handlers.coach.weeklyCheckIn();
  }
  if (method === "POST" && pathname === "/api/coach/weekly-check-in/messages") {
    return handlers.coach.sendCheckInMessage((body as { content?: string })?.content ?? "");
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
