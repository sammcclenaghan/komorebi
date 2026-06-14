import { contextBridge, ipcRenderer } from "electron";
import type { KomorebiApi } from "~/shared/komorebi-api";
import type { GenerationProgress } from "~/main/checklist/orchestrator";

const api: KomorebiApi = {
  getVersion: () => ipcRenderer.invoke("app:version"),
  integrations: {
    list: () => ipcRenderer.invoke("integrations:list"),
    refresh: () => ipcRenderer.invoke("integrations:refresh"),
    beginConnect: (slug) => ipcRenderer.invoke("integrations:begin-connect", slug),
    awaitConnect: (slug) => ipcRenderer.invoke("integrations:await-connect", slug),
    disconnect: (slug) => ipcRenderer.invoke("integrations:disconnect", slug)
  },
  goals: {
    list: () => ipcRenderer.invoke("goals:list"),
    add: (input) => ipcRenderer.invoke("goals:add", input),
    update: (input) => ipcRenderer.invoke("goals:update", input),
    delete: (id) => ipcRenderer.invoke("goals:delete", id)
  },
  checklist: {
    today: () => ipcRenderer.invoke("checklist:today"),
    generate: () => ipcRenderer.invoke("checklist:generate"),
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
    skipAndRegenerate: (id) => ipcRenderer.invoke("suggestion:skip-regenerate", id)
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
  onNavigate: (handler) => {
    const listener = (_: unknown, view: string) => handler(view);
    ipcRenderer.on("app:navigate", listener);
    return () => {
      ipcRenderer.off("app:navigate", listener);
    };
  }
};

contextBridge.exposeInMainWorld("komorebi", api);
