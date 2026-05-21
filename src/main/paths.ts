import path from "node:path";
import os from "node:os";

export type KomorebiPaths = {
  dataDir: string;
  dbFile: string;
};

export function resolvePaths(override?: { dataDir?: string }): KomorebiPaths {
  const dataDir = override?.dataDir ?? defaultDataDir();
  return {
    dataDir,
    dbFile: path.join(dataDir, "komorebi.db")
  };
}

function defaultDataDir(): string {
  if (process.env.KOMOREBI_DATA_DIR) return process.env.KOMOREBI_DATA_DIR;

  // Lazy-load electron only when running inside Electron.
  try {
    const electron = require("electron");
    if (electron?.app?.getPath) {
      return path.join(electron.app.getPath("userData"), "data");
    }
  } catch {
    // Not inside Electron — fall through to OS default.
  }

  return path.join(os.homedir(), ".komorebi");
}
