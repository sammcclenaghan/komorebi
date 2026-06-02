/**
 * Compile the vendored Icon Composer bundle (build/AppIcon.icon) into a
 * macOS .icns for electron-builder.
 *
 * Icon Composer's .icon is a source format (icon.json + layer SVGs) that the
 * Apple toolchain renders with dynamic Liquid Glass at runtime. Electron apps
 * don't go through that pipeline, so we render a faithful STATIC composite of
 * the same composition and hand electron-builder a plain .icns:
 *   - linear gradient background (P3 colours -> sRGB)
 *   - each layer's SVG, with its scale + translation applied
 *   - a soft neutral contact shadow under the layer group
 *   - Apple-style squircle mask (transparent corners)
 *
 * Re-run after editing the icon in Icon Composer and re-copying it:
 *   cp -R ~/Documents/Untitled.icon build/AppIcon.icon && pnpm icon:icns
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const iconBundle = resolve(root, "build/AppIcon.icon");
const SIZE = 1024;
const CORNER = 224; // ~0.219 * 1024, Apple squircle approximation

// --- display-p3 (gamma-encoded) -> sRGB hex ----------------------------------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const clamp01 = (c) => Math.min(1, Math.max(0, c));

function p3ToHex(p3) {
  const [r, g, b] = p3.map(srgbToLinear);
  // linear display-P3 -> linear sRGB (D65)
  const rs = 1.2249401 * r - 0.2249404 * g;
  const gs = -0.0420569 * r + 1.0420571 * g;
  const bs = -0.0196376 * r - 0.0786361 * g + 1.0982735 * b;
  const to255 = (x) => Math.round(clamp01(linearToSrgb(clamp01(x))) * 255);
  return "#" + [to255(rs), to255(gs), to255(bs)]
    .map((v) => v.toString(16).padStart(2, "0")).join("");
}

// "display-p3:1.0,0.945,0.722,1.0" -> { hex, alpha }
function parseColor(str) {
  const parts = str.replace(/^display-p3:/, "").split(",").map(Number);
  return { hex: p3ToHex(parts.slice(0, 3)), alpha: parts[3] ?? 1 };
}

// --- build the composite SVG -------------------------------------------------
const spec = JSON.parse(readFileSync(join(iconBundle, "icon.json"), "utf8"));

// background gradient
const [c0, c1] = spec.fill["linear-gradient"].map(parseColor);
// Icon Composer omits orientation for a default vertical (top -> bottom) fill.
const o = spec.fill.orientation ?? { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } };
const grad = `
  <linearGradient id="__bg" gradientUnits="userSpaceOnUse"
    x1="${o.start.x * SIZE}" y1="${o.start.y * SIZE}"
    x2="${o.stop.x * SIZE}"  y2="${o.stop.y * SIZE}">
    <stop offset="0" stop-color="${c0.hex}" stop-opacity="${c0.alpha}"/>
    <stop offset="1" stop-color="${c1.hex}" stop-opacity="${c1.alpha}"/>
  </linearGradient>`;

// layers (back -> front), each with scale + translation about the canvas centre
const C = SIZE / 2;
const layers = spec.groups.flatMap((group) => {
  const sh = group.shadow;
  return group.layers.map((layer) => {
    const inner = readFileSync(join(iconBundle, "Assets", layer["image-name"]), "utf8")
      .replace(/<\?xml[^>]*\?>/g, "")
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>/, "");
    const scale = layer.position?.scale ?? 1;
    const [tx, ty] = layer.position?.["translation-in-points"] ?? [0, 0];
    const transform =
      `translate(${tx} ${ty}) translate(${C} ${C}) scale(${scale}) translate(${-C} ${-C})`;
    const filter = sh
      ? `filter="url(#__shadow)"` // soft neutral contact shadow
      : "";
    const shadowDef = sh
      ? `<filter id="__shadow" x="-30%" y="-30%" width="160%" height="160%">
           <feDropShadow dx="0" dy="${Math.round(SIZE * 0.012)}"
             stdDeviation="${Math.round(SIZE * 0.022)}"
             flood-color="#3a2c12" flood-opacity="${(sh.opacity ?? 0.5) * 0.7}"/>
         </filter>`
      : "";
    return { shadowDef, group: `<g ${filter} transform="${transform}">${inner}</g>` };
  });
});

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
  xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${grad}
    ${layers.map((l) => l.shadowDef).join("\n")}
    <clipPath id="__squircle"><rect width="${SIZE}" height="${SIZE}"
      rx="${CORNER}" ry="${CORNER}"/></clipPath>
  </defs>
  <g clip-path="url(#__squircle)">
    <rect width="${SIZE}" height="${SIZE}" fill="url(#__bg)"/>
    ${layers.map((l) => l.group).join("\n")}
  </g>
</svg>`;

// --- render iconset + compile .icns ------------------------------------------
const work = mkdtempSync(join(tmpdir(), "icns-"));
const iconset = join(work, "icon.iconset");
execSync(`mkdir -p "${iconset}"`);

const variants = [
  ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
];
for (const [name, px] of variants) {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: px },
    background: "rgba(0,0,0,0)",
  }).render().asPng();
  writeFileSync(join(iconset, name), png);
}

const out = resolve(root, "build/icon.icns");
execSync(`iconutil -c icns "${iconset}" -o "${out}"`);
// also keep a 1024 preview png alongside it
writeFileSync(
  resolve(root, "build/icon.png"),
  new Resvg(svg, { fitTo: { mode: "width", value: 1024 }, background: "rgba(0,0,0,0)" })
    .render().asPng()
);
rmSync(work, { recursive: true, force: true });
console.log(`✔ wrote ${out}`);
console.log(`✔ bg gradient: ${c0.hex} -> ${c1.hex}`);
