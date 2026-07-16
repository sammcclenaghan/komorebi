import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  awaitConnect,
  beginConnect,
  disconnectIntegration,
  getIntegrations,
  refreshConnections
} from "~/main/integrations/service";
import { getCurrentWeather } from "~/main/weather/service";
import { addGoal, listGoals, updateGoal } from "~/main/store/goals";
import {
  deleteGoalCascade,
  generateTodayChecklist,
  getHistory,
  getTodayChecklist,
  regenerateTodayChecklist,
  skipAndRegenerate
} from "~/main/checklist/orchestrator";
import {
  getSuggestion,
  updateSuggestionRating,
  updateSuggestionStatus
} from "~/main/store/suggestions";
import { addReflection, listReflectionsForSuggestion } from "~/main/store/reflections";
import { fetchLinkPreview } from "~/main/links/preview";
import { getSettings, updateSettings, type SettingsUpdate } from "~/main/store/settings";
import type { Goal, GoalPriority, SuggestionRating, SuggestionStatus } from "~/shared/types";

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

  if (method === "GET" && pathname === "/api/integrations") return getIntegrations();
  if (method === "POST" && pathname === "/api/integrations/refresh") return refreshConnections();

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/connect")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/connect".length));
    return beginConnect(slug);
  }

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/await")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/await".length));
    return awaitConnect(slug);
  }

  if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/disconnect")) {
    const slug = decodeURIComponent(pathname.slice("/api/integrations/".length, -"/disconnect".length));
    await disconnectIntegration(slug);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/goals") return listGoals();
  if (method === "POST" && pathname === "/api/goals") {
    return addGoal(
      body as { title: string; description?: string; context?: string; priority?: GoalPriority }
    );
  }
  if (method === "PATCH" && pathname.startsWith("/api/goals/")) {
    const id = decodeURIComponent(pathname.slice("/api/goals/".length));
    const input = body as {
      updates: Partial<Pick<Goal, "title" | "description" | "context" | "status" | "priority">>;
    };
    return updateGoal(id, input.updates);
  }
  if (method === "DELETE" && pathname.startsWith("/api/goals/")) {
    const id = decodeURIComponent(pathname.slice("/api/goals/".length));
    await deleteGoalCascade(id);
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/checklist/today") return getTodayChecklist();
  if (method === "POST" && pathname === "/api/checklist/generate") return generateTodayChecklist();
  if (method === "POST" && pathname === "/api/checklist/regenerate") return regenerateTodayChecklist();

  if (method === "GET" && pathname === "/api/history") {
    const params = new URLSearchParams(search);
    const daysBack = params.has("daysBack") ? Number(params.get("daysBack")) : undefined;
    return getHistory(daysBack);
  }

  if (method === "GET" && pathname.startsWith("/api/suggestions/")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length));
    return getSuggestion(id);
  }
  if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/status")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length, -"/status".length));
    const input = body as { status: SuggestionStatus };
    return updateSuggestionStatus(id, input.status);
  }
  if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/rating")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length, -"/rating".length));
    const input = body as { rating: SuggestionRating };
    return updateSuggestionRating(id, input.rating);
  }
  if (method === "POST" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/skip-regenerate")) {
    const id = decodeURIComponent(pathname.slice("/api/suggestions/".length, -"/skip-regenerate".length));
    const input = (body ?? {}) as { reason?: string };
    return skipAndRegenerate(id, input.reason);
  }

  if (method === "GET" && pathname.startsWith("/api/reflections/")) {
    const suggestionId = decodeURIComponent(pathname.slice("/api/reflections/".length));
    return listReflectionsForSuggestion(suggestionId);
  }
  if (method === "POST" && pathname === "/api/reflections") {
    return addReflection(
      body as { suggestionId: string; text: string; rating?: "up" | "down" | null }
    );
  }

  if (method === "GET" && pathname === "/api/weather/current") {
    const params = new URLSearchParams(search);
    const location = params.get("location") ?? "";
    return getCurrentWeather(location);
  }

  if (method === "GET" && pathname === "/api/links/preview") {
    const params = new URLSearchParams(search);
    const target = params.get("url") ?? "";
    return fetchLinkPreview(target);
  }

  if (method === "GET" && pathname === "/api/settings") return getSettings();
  if (method === "PATCH" && pathname === "/api/settings") {
    return updateSettings(body as SettingsUpdate);
  }

  throw new RouteNotFoundError();
}

export class RouteNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "RouteNotFoundError";
  }
}
