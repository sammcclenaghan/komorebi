import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationView } from "~/main/integrations/service";
import type { ConnectionSummary } from "~/main/integrations/composio";
import type { ChecklistDay, GenerationProgress, HistoryDay } from "~/main/checklist/orchestrator";
import type { AppSettings, Goal, Reflection, Suggestion, SuggestionRating, SuggestionStatus } from "~/shared/types";
import type { SettingsUpdate } from "~/main/store/settings";
import type { WeatherSummary } from "~/main/weather/service";
import type { LinkPreview } from "~/main/links/preview";

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  integrations: {
    list: (): Promise<IntegrationView[]> => ipcRenderer.invoke("integrations:list"),
    refresh: (): Promise<ConnectionSummary[]> => ipcRenderer.invoke("integrations:refresh"),
    beginConnect: (slug: string): Promise<{ connectionId: string; redirectUrl: string | null }> =>
      ipcRenderer.invoke("integrations:begin-connect", slug),
    awaitConnect: (slug: string): Promise<ConnectionSummary | null> =>
      ipcRenderer.invoke("integrations:await-connect", slug),
    disconnect: (slug: string): Promise<void> =>
      ipcRenderer.invoke("integrations:disconnect", slug)
  },
  goals: {
    list: (): Promise<Goal[]> => ipcRenderer.invoke("goals:list"),
    add: (input: { title: string; description?: string; context?: string }): Promise<Goal> =>
      ipcRenderer.invoke("goals:add", input),
    update: (
      input: { id: string; updates: Partial<Pick<Goal, "title" | "description" | "context" | "status">> }
    ): Promise<Goal> => ipcRenderer.invoke("goals:update", input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("goals:delete", id)
  },
  checklist: {
    today: (): Promise<ChecklistDay> => ipcRenderer.invoke("checklist:today"),
    generate: (): Promise<ChecklistDay> => ipcRenderer.invoke("checklist:generate"),
    onProgress: (handler: (event: GenerationProgress) => void): (() => void) => {
      const listener = (_: unknown, payload: GenerationProgress) => handler(payload);
      ipcRenderer.on("checklist:progress", listener);
      return () => {
        ipcRenderer.off("checklist:progress", listener);
      };
    }
  },
  suggestions: {
    get: (id: string): Promise<Suggestion | null> => ipcRenderer.invoke("suggestion:get", id),
    setStatus: (input: { id: string; status: SuggestionStatus }): Promise<Suggestion> =>
      ipcRenderer.invoke("suggestion:set-status", input),
    setRating: (input: { id: string; rating: SuggestionRating }): Promise<Suggestion> =>
      ipcRenderer.invoke("suggestion:set-rating", input),
    skipAndRegenerate: (id: string): Promise<Suggestion> =>
      ipcRenderer.invoke("suggestion:skip-regenerate", id)
  },
  reflections: {
    list: (suggestionId: string): Promise<Reflection[]> =>
      ipcRenderer.invoke("reflection:list", suggestionId),
    add: (input: { suggestionId: string; text: string; rating?: "up" | "down" | null }): Promise<Reflection> =>
      ipcRenderer.invoke("reflection:add", input)
  },
  weather: {
    current: (location: string): Promise<WeatherSummary | null> =>
      ipcRenderer.invoke("weather:current", location)
  },
  links: {
    preview: (url: string): Promise<LinkPreview> => ipcRenderer.invoke("link:preview", url)
  },
  history: {
    list: (daysBack?: number): Promise<HistoryDay[]> =>
      ipcRenderer.invoke("history:list", daysBack)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    update: (update: SettingsUpdate): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:update", update)
  },
  /** Main asks the renderer to switch views (e.g. on notification click). */
  onNavigate: (handler: (view: string) => void): (() => void) => {
    const listener = (_: unknown, view: string) => handler(view);
    ipcRenderer.on("app:navigate", listener);
    return () => {
      ipcRenderer.off("app:navigate", listener);
    };
  }
};

contextBridge.exposeInMainWorld("komorebi", api);

export type KomorebiApi = typeof api;
