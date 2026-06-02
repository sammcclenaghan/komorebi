/**
 * Rasterize the SVG assets into PNGs:
 *  - build/icon.svg → build/icon.png (1024×1024) for the macOS app icon
 *    (electron-builder generates the .icns from it at package time).
 *  - build/tray.svg → build/trayTemplate.png (22px) + @2x (44px) for the
 *    menu-bar tray. Loaded as a macOS template image at runtime.
 *
 * Run with: pnpm icon
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function rasterize(svgRelPath, pngRelPath, width) {
  const svg = readFileSync(resolve(root, svgRelPath), "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0, 0, 0, 0)"
  });
  const pngData = resvg.render().asPng();
  const pngPath = resolve(root, pngRelPath);
  writeFileSync(pngPath, pngData);
  console.log(`✔ wrote ${pngPath} (${pngData.length.toLocaleString()} bytes)`);
}

rasterize("build/icon.svg", "build/icon.png", 1024);
rasterize("build/tray.svg", "build/trayTemplate.png", 22);
rasterize("build/tray.svg", "build/trayTemplate@2x.png", 44);

// Layers for Icon Composer (.icon). Transparent-background sphere is the
// foreground; background is optional (Icon Composer can do the gradient too).
rasterize("build/sphere.svg", "build/sphere.png", 1024);
rasterize("build/background.svg", "build/background.png", 1024);
