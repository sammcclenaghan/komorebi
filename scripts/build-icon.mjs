/**
 * Rasterize build/icon.svg → build/icon.png (1024×1024).
 * electron-builder picks up build/icon.png automatically for the
 * macOS app icon and generates the .icns at package time.
 *
 * Run with: pnpm icon
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svgPath = resolve(root, "build/icon.svg");
const pngPath = resolve(root, "build/icon.png");

const svg = readFileSync(svgPath, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1024 },
  background: "rgba(0, 0, 0, 0)"
});
const pngData = resvg.render().asPng();
writeFileSync(pngPath, pngData);

console.log(`✔ wrote ${pngPath} (${pngData.length.toLocaleString()} bytes)`);
