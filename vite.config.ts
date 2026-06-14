import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const isWeb = process.env.KOMOREBI_WEB === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: isWeb ? "/" : "./",
  define: {
    "import.meta.env.VITE_KOMOREBI_WEB": JSON.stringify(isWeb ? "true" : "false"),
    "import.meta.env.VITE_API_BASE": JSON.stringify(process.env.VITE_API_BASE ?? "")
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    host: isWeb ? "0.0.0.0" : "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: isWeb
      ? {
          "/api": {
            target: `http://127.0.0.1:${process.env.KOMOREBI_PORT ?? 3847}`,
            changeOrigin: true
          }
        }
      : undefined
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});
