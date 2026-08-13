import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/server/main.ts"],
  format: "cjs",
  outDir: "dist-server",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node20",
  clean: true
});
