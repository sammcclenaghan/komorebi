import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    main: "src/server/main.ts",
    database: "src/tools/database.ts"
  },
  format: "cjs",
  outDir: "dist-server",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node20",
  clean: true
});
