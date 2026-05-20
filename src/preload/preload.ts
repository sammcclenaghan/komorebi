import { contextBridge, ipcRenderer } from "electron";

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version")
};

contextBridge.exposeInMainWorld("goalpath", api);

export type GoalpathApi = typeof api;
