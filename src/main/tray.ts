import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, Menu, nativeImage, Tray } from "electron";
import { showMainWindow } from "./window";
import { runScheduledGeneration } from "./scheduler";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Hold a module-level reference so the Tray isn't garbage-collected.
let tray: Tray | null = null;

/** Create the menu-bar tray. Safe to call once on app ready. */
export function initTray(): void {
  if (tray) return;

  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Komorebi");

  const menu = Menu.buildFromTemplate([
    { label: "Open Komorebi", click: () => showMainWindow() },
    {
      label: "Compose today now",
      click: () => void runScheduledGeneration({ force: true })
    },
    { type: "separator" },
    { label: "Quit Komorebi", role: "quit" }
  ]);
  tray.setContextMenu(menu);
}

/**
 * Resolve the template PNG: shipped under Resources in packaged builds (via
 * electron-builder extraResources), or build/ in dev. Falls back to an empty
 * image so a missing asset never crashes startup.
 */
function loadTrayIcon(): Electron.NativeImage {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "trayTemplate.png")]
    : [path.join(moduleDir, "..", "build", "trayTemplate.png")];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const image = nativeImage.createFromPath(file);
      // macOS recolors template images to match the menu bar (light/dark).
      image.setTemplateImage(true);
      return image;
    }
  }
  console.error("[tray] template icon not found; using empty image");
  return nativeImage.createEmpty();
}
