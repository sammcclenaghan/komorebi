import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, nativeTheme, shell } from "electron";

const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

/** The live main window, or null if there isn't one. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function createMainWindow(): BrowserWindow {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  // First-paint background — keeps a frame from flashing white on dark systems
  // (and vice versa) before the renderer applies the user's preference.
  const initialBg = nativeTheme.shouldUseDarkColors ? "#1d1d1c" : "#fbfbf9";

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 680,
    minHeight: 560,
    title: "Komorebi",
    backgroundColor: initialBg,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(moduleDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(moduleDir, "..", "dist", "renderer", "index.html"));
  }

  routeExternalLinks(win);
  fixEmbedReferer(win);
  return win;
}

/**
 * Bring the app to the foreground — restoring/focusing the existing window,
 * or creating one if it was closed (macOS keeps the app alive window-less).
 * Used by the tray and notification-click handlers.
 */
export function showMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  return createMainWindow();
}

/**
 * Packaged builds load the renderer from file://, so iframes to YouTube
 * et al. go out with a null/empty Referer — which their player rejects
 * with "Error 153 / config error". Stamp a legitimate Referer + Origin
 * on requests to the video hosts so embeds play. Scoped by URL filter so
 * it never touches anything else.
 */
function fixEmbedReferer(win: BrowserWindow): void {
  const filter = {
    urls: [
      "*://*.youtube.com/*",
      "*://*.youtube-nocookie.com/*",
      "*://*.ytimg.com/*",
      "*://*.googlevideo.com/*",
      "*://*.vimeo.com/*",
      "*://*.loom.com/*"
    ]
  };
  win.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const host = (() => {
      try {
        return new URL(details.url).hostname;
      } catch {
        return "";
      }
    })();
    const origin = host.includes("vimeo")
      ? "https://vimeo.com"
      : host.includes("loom")
        ? "https://www.loom.com"
        : "https://www.youtube.com";
    // Referer + Origin must agree — under file:// the Origin goes out as
    // "null", which mismatches the Referer and trips YouTube error 152.
    details.requestHeaders["Referer"] = `${origin}/`;
    details.requestHeaders["Origin"] = origin;
    callback({ requestHeaders: details.requestHeaders });
  });
}

/**
 * Send every http/https/mailto link the renderer tries to navigate to
 * out to the system default browser instead of opening it inside the
 * Electron window. Covers both `<a target="_blank">` (window.open path)
 * and plain `<a href>` (will-navigate path).
 */
function routeExternalLinks(win: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file://") || (devServerUrl ? url.startsWith(devServerUrl) : false);
    if (allowed) return;
    if (/^(https?|mailto):/.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}
