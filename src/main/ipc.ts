/**
 * Electron transport: registers every IPC channel against the shared
 * handler map, and pushes generation progress to all renderer windows.
 */
import { BrowserWindow, app, ipcMain } from "electron";
import type { GoalAddInput, GoalUpdateInput, SettingsUpdate } from "~/shared/api";
import type { SuggestionRating, SuggestionStatus } from "~/shared/schema";
import { handlers } from "./api/handlers";
import { rescheduleScheduler } from "./scheduler";

export function registerIpcHandlers(): void {
  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("integrations:list", () => handlers.integrations.list());
  ipcMain.handle("integrations:refresh", () => handlers.integrations.refresh());
  ipcMain.handle("integrations:begin-connect", (_e, slug: string) =>
    handlers.integrations.beginConnect(slug)
  );
  ipcMain.handle("integrations:await-connect", (_e, slug: string) =>
    handlers.integrations.awaitConnect(slug)
  );
  ipcMain.handle("integrations:disconnect", (_e, slug: string) =>
    handlers.integrations.disconnect(slug)
  );

  ipcMain.handle("goals:list", () => handlers.goals.list());
  ipcMain.handle("goals:add", (_e, input: GoalAddInput) => handlers.goals.add(input));
  ipcMain.handle("goals:update", (_e, input: GoalUpdateInput) => handlers.goals.update(input));
  ipcMain.handle("goals:delete", (_e, id: string) => handlers.goals.delete(id));

  ipcMain.handle("checklist:today", () => handlers.checklist.today());
  ipcMain.handle("checklist:generate", () => handlers.checklist.generate());
  ipcMain.handle("checklist:regenerate", () => handlers.checklist.regenerate());
  ipcMain.handle("checklist:retry-goal", (_e, goalId: string) =>
    handlers.checklist.retryGoal(goalId)
  );

  ipcMain.handle("history:list", (_e, daysBack?: number) => handlers.history.list(daysBack));

  ipcMain.handle("suggestion:get", (_e, id: string) => handlers.suggestions.get(id));
  ipcMain.handle(
    "suggestion:set-status",
    (_e, input: { id: string; status: SuggestionStatus }) => handlers.suggestions.setStatus(input)
  );
  ipcMain.handle(
    "suggestion:set-rating",
    (_e, input: { id: string; rating: SuggestionRating }) => handlers.suggestions.setRating(input)
  );
  ipcMain.handle("suggestion:skip-regenerate", (_e, id: string, reason?: string) =>
    handlers.suggestions.skipAndRegenerate(id, reason)
  );
  ipcMain.handle("suggestion:regenerate", (_e, id: string, note?: string) =>
    handlers.suggestions.regenerate(id, note)
  );

  ipcMain.handle("reflection:list", (_e, suggestionId: string) =>
    handlers.reflections.list(suggestionId)
  );
  ipcMain.handle(
    "reflection:add",
    (_e, input: { suggestionId: string; text: string; rating?: "up" | "down" | null }) =>
      handlers.reflections.add(input)
  );

  ipcMain.handle("weather:current", (_e, location: string) =>
    handlers.weather.current(location)
  );

  ipcMain.handle("link:preview", (_e, url: string) => handlers.links.preview(url));

  ipcMain.handle("settings:get", () => handlers.settings.get());
  ipcMain.handle("settings:update", async (_e, update: SettingsUpdate) => {
    const next = await handlers.settings.update(update);
    // Only reschedule when the schedule actually changed; theme-only updates
    // shouldn't bounce timers.
    if (update.schedule && ("enabled" in update.schedule || "time" in update.schedule)) {
      await rescheduleScheduler();
    }
    return next;
  });

  // Push generation progress to every open window.
  void handlers.subscribeProgress((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send("checklist:progress", event);
    }
  });
}
