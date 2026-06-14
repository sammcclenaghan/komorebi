import type { GenerationProgress } from "./checklist/orchestrator";

const CHANNEL = "checklist:progress";
type ProgressListener = (event: GenerationProgress) => void;

const listeners = new Set<ProgressListener>();

export function subscribeProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Broadcast generation progress to SSE subscribers and Electron renderers. */
export function emitProgress(payload: GenerationProgress): void {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("[progress] listener failed:", err);
    }
  }

  if (process.versions.electron) {
    try {
      const { BrowserWindow } = require("electron") as typeof import("electron");
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.webContents.send(CHANNEL, payload);
      }
    } catch {
      // Electron unavailable — SSE subscribers only.
    }
  }
}
