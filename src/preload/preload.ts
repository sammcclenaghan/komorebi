import { contextBridge, ipcRenderer } from "electron";
import type { KomorebiApi } from "~/shared/api";
import type { GenerationProgress } from "~/shared/schema";

const api: KomorebiApi = {
  getVersion: () => ipcRenderer.invoke("app:version"),
  goals: {
    list: () => ipcRenderer.invoke("goals:list"),
    add: (input) => ipcRenderer.invoke("goals:add", input),
    update: (input) => ipcRenderer.invoke("goals:update", input),
    delete: (id) => ipcRenderer.invoke("goals:delete", id)
  },
  paths: {
    get: (id) => ipcRenderer.invoke("paths:get", id),
    generate: (id) => ipcRenderer.invoke("paths:generate", id),
    activate: (input) => ipcRenderer.invoke("paths:activate", input),
    completeMilestone: (input) => ipcRenderer.invoke("paths:complete-milestone", input)
  },
  checklist: {
    today: () => ipcRenderer.invoke("checklist:today"),
    generate: () => ipcRenderer.invoke("checklist:generate"),
    regenerate: () => ipcRenderer.invoke("checklist:regenerate"),
    retryGoal: (goalId) => ipcRenderer.invoke("checklist:retry-goal", goalId),
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
    skipAndRegenerate: (id, reason) => ipcRenderer.invoke("suggestion:skip-regenerate", id, reason),
    regenerate: (id, note) => ipcRenderer.invoke("suggestion:regenerate", id, note)
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
    weeklyCheckIn: () => ipcRenderer.invoke("coach:weekly-check-in"),
    sendCheckInMessage: (content) => ipcRenderer.invoke("coach:send-check-in-message", content)
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
