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
  ipcMain.handle(
    "generation:enqueue-checklist",
    (_event, input: { requestId: string }) =>
      handlers.generation.enqueueChecklist(input.requestId)
  );
  ipcMain.handle(
    "generation:enqueue-checklist-regeneration",
    (_event, input: { requestId: string }) =>
      handlers.generation.enqueueChecklistRegeneration(input.requestId)
  );
  ipcMain.handle(
    "generation:enqueue-goal-retry",
    (_event, input: { requestId: string; goalId: string }) =>
      handlers.generation.enqueueGoalRetry(input.requestId, input.goalId)
  );
  ipcMain.handle(
    "generation:enqueue-path-generation",
    (_event, input: { requestId: string; goalId: string }) =>
      handlers.generation.enqueuePathGeneration(input.requestId, input.goalId)
  );
  ipcMain.handle(
    "generation:enqueue-suggestion-regeneration",
    (
      _event,
      input: { requestId: string; suggestionId: string; note?: string }
    ) =>
      handlers.generation.enqueueSuggestionRegeneration(
        input.requestId,
        input.suggestionId,
        input.note
      )
  );
  ipcMain.handle(
    "generation:enqueue-suggestion-skip",
    (
      _event,
      input: { requestId: string; suggestionId: string; reason?: string }
    ) =>
      handlers.generation.enqueueSuggestionSkip(
        input.requestId,
        input.suggestionId,
        input.reason
      )
  );
  ipcMain.handle(
    "generation:enqueue-check-in-reply",
    (_event, input: { requestId: string; content: string }) =>
      handlers.generation.enqueueCheckInReply(input.requestId, input.content)
  );
  ipcMain.handle("generation:recent-jobs", (_event, limit?: number) =>
    handlers.generation.recentJobs(limit)
  );

  ipcMain.handle("goals:list", () => handlers.goals.list());
  ipcMain.handle("goals:add", (_e, input: GoalAddInput) => handlers.goals.add(input));
  ipcMain.handle("goals:update", (_e, input: GoalUpdateInput) => handlers.goals.update(input));
  ipcMain.handle("goals:delete", (_e, id: string) => handlers.goals.delete(id));
  ipcMain.handle("paths:get", (_event, id: string) => handlers.paths.get(id));
  ipcMain.handle("paths:activate", (_event, input) => handlers.paths.activate(input));
  ipcMain.handle("paths:complete-milestone", (_event, input) =>
    handlers.paths.completeMilestone(input)
  );

  ipcMain.handle("checklist:today", () => handlers.checklist.today());
  ipcMain.handle("checklist:stats", () => handlers.checklist.stats());

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

  ipcMain.handle("coach:memory", () => handlers.coach.memory());
  ipcMain.handle("coach:weekly-check-in", () => handlers.coach.weeklyCheckIn());

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
