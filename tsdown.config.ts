import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  platform: "node" as const,
  target: "node20" as const,
  external: [/^electron(\/.*)?$/]
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main/main.ts"],
    clean: true
  },
  {
    ...shared,
    entry: ["src/preload/preload.ts"]
  },
  {
    ...shared,
    entry: ["src/server/main.ts"],
    outDir: "dist-server",
    clean: true
  }
]);
