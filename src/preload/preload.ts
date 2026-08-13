import { contextBridge, ipcRenderer } from "electron";
import type { KomorebiApi } from "~/shared/api";
import type { GenerationProgress } from "~/shared/schema";

const api: KomorebiApi = {
  getVersion: () => ipcRenderer.invoke("app:version"),
  generation: {
    enqueueChecklist: (input) => ipcRenderer.invoke("generation:enqueue-checklist", input),
    enqueueChecklistRegeneration: (input) =>
      ipcRenderer.invoke("generation:enqueue-checklist-regeneration", input),
    enqueueGoalRetry: (input) => ipcRenderer.invoke("generation:enqueue-goal-retry", input),
    enqueuePathGeneration: (input) =>
      ipcRenderer.invoke("generation:enqueue-path-generation", input),
    enqueueSuggestionRegeneration: (input) =>
      ipcRenderer.invoke("generation:enqueue-suggestion-regeneration", input),
    enqueueSuggestionSkip: (input) =>
      ipcRenderer.invoke("generation:enqueue-suggestion-skip", input),
    enqueueCheckInReply: (input) =>
      ipcRenderer.invoke("generation:enqueue-check-in-reply", input),
    recentJobs: (limit) => ipcRenderer.invoke("generation:recent-jobs", limit)
  },
  goals: {
    list: () => ipcRenderer.invoke("goals:list"),
    add: (input) => ipcRenderer.invoke("goals:add", input),
    update: (input) => ipcRenderer.invoke("goals:update", input),
    delete: (id) => ipcRenderer.invoke("goals:delete", id)
  },
  paths: {
    get: (id) => ipcRenderer.invoke("paths:get", id),
    activate: (input) => ipcRenderer.invoke("paths:activate", input),
    completeMilestone: (input) => ipcRenderer.invoke("paths:complete-milestone", input)
  },
  checklist: {
    today: () => ipcRenderer.invoke("checklist:today"),
    stats: () => ipcRenderer.invoke("checklist:stats"),
    onProgress: (handler) => {
      const listener = (_: unknown, payload: GenerationProgress) => handler(payload);
      ipcRenderer.on("checklist:progress", listener);
      return () => {
        ipcRenderer.off("checklist:progress", listener);
      };
    }
  },
  suggestions: {
    get: (id) => ipcRenderer.invoke("suggestion:get", id),
    setStatus: (input) => ipcRenderer.invoke("suggestion:set-status", input),
    setRating: (input) => ipcRenderer.invoke("suggestion:set-rating", input),
  },
  reflections: {
    list: (suggestionId) => ipcRenderer.invoke("reflection:list", suggestionId),
    add: (input) => ipcRenderer.invoke("reflection:add", input)
  },
  weather: {
    current: (location) => ipcRenderer.invoke("weather:current", location)
  },
  links: {
    preview: (url) => ipcRenderer.invoke("link:preview", url)
  },
  history: {
    list: (daysBack) => ipcRenderer.invoke("history:list", daysBack)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (update) => ipcRenderer.invoke("settings:update", update)
  },
  coach: {
    memory: () => ipcRenderer.invoke("coach:memory"),
    weeklyCheckIn: () => ipcRenderer.invoke("coach:weekly-check-in")
  },
  onNavigate: (handler) => {
    const listener = (_: unknown, view: string) => handler(view);
    ipcRenderer.on("app:navigate", listener);
    return () => {
      ipcRenderer.off("app:navigate", listener);
    };
  }
};

contextBridge.exposeInMainWorld("komorebi", api);
