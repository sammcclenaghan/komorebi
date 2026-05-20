import path from "node:path";
import os from "node:os";

export type GoalpathPaths = {
  dataDir: string;
  dbFile: string;
};

export function resolvePaths(override?: { dataDir?: string }): GoalpathPaths {
  const dataDir = override?.dataDir ?? defaultDataDir();
  return {
    dataDir,
    dbFile: path.join(dataDir, "goalpath.db")
  };
}

function defaultDataDir(): string {
  if (process.env.GOALPATH_DATA_DIR) return process.env.GOALPATH_DATA_DIR;

  // Lazy-load electron only when running inside Electron.
  try {
    const electron = require("electron");
    if (electron?.app?.getPath) {
      return path.join(electron.app.getPath("userData"), "data");
    }
  } catch {
    // Not inside Electron — fall through to OS default.
  }

  return path.join(os.homedir(), ".goalpath");
}
