import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationView } from "~/main/integrations/service";
import type { ConnectionSummary } from "~/main/integrations/composio";
import type { ChecklistDay } from "~/main/checklist/orchestrator";
import type { Goal, Reflection, Suggestion, SuggestionStatus } from "~/shared/types";

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
    generate: (): Promise<ChecklistDay> => ipcRenderer.invoke("checklist:generate")
  },
  suggestions: {
    get: (id: string): Promise<Suggestion | null> => ipcRenderer.invoke("suggestion:get", id),
    setStatus: (input: { id: string; status: SuggestionStatus }): Promise<Suggestion> =>
      ipcRenderer.invoke("suggestion:set-status", input)
  },
  reflections: {
    list: (suggestionId: string): Promise<Reflection[]> =>
      ipcRenderer.invoke("reflection:list", suggestionId),
    add: (input: { suggestionId: string; text: string; rating?: "up" | "down" | null }): Promise<Reflection> =>
      ipcRenderer.invoke("reflection:add", input)
  }
};

contextBridge.exposeInMainWorld("goalpath", api);

export type GoalpathApi = typeof api;
