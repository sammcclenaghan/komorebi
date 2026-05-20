import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationView } from "~/main/integrations/service";
import type { ConnectionSummary } from "~/main/integrations/composio";

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
  }
};

contextBridge.exposeInMainWorld("goalpath", api);

export type GoalpathApi = typeof api;
