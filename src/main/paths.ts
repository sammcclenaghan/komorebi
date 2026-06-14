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

  if (process.versions.electron) {
    try {
      const { app } = require("electron") as typeof import("electron");
      if (app?.getPath) {
        return path.join(app.getPath("userData"), "data");
      }
    } catch {
      // fall through
    }
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Komorebi", "data");
  }

  return path.join(os.homedir(), ".komorebi");
}
