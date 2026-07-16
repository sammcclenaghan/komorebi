# Plan 006: Give the pinned web app the real icon and a dark-aware status bar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- scripts/build-icns.mjs index.html public/manifest.webmanifest src/renderer/lib/use-theme.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI / pinned-app presence)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

The app's primary form is pinned to an iPhone home screen, but its
home-screen presence is broken in two ways:

1. **The icon.** `index.html` points `apple-touch-icon` at `/icon.svg` —
   iOS ignores SVG touch icons, so the pinned tile falls back to a generic
   screenshot/letter tile instead of the app's icon (the warm sunrise-
   gradient squircle with the glowing sphere used for the macOS app). The
   web manifest likewise only offers the SVG.
2. **The status bar.** `theme-color` is a single hardcoded light value
   (`#faf9f7`). The app has a full dark theme (canvas
   `oklch(18% 0.006 80)`), so in dark mode the iOS status bar / browser
   chrome stays paper-white against a near-black canvas.

After this plan: the pinned icon is the real icon (rendered full-bleed —
iOS applies its own corner mask, so the pre-rounded `build/icon.png` with
transparent corners must NOT be used directly: iOS fills transparency with
black), and the status bar color follows the active theme, both pre-React
(inline script) and live (when the user flips the theme in Settings).

## Current state

- `scripts/build-icns.mjs` — composes the canonical icon as an SVG string
  from the Icon Composer bundle `build/AppIcon.icon` (icon.json + layer
  SVGs): background gradient + positioned layers + contact shadow, then a
  squircle `clipPath` (`id="__squircle"`, lines 100–106), rendered via
  `@resvg/resvg-js` into an `.icns` (lines 109–130) plus a 1024
  `build/icon.png` preview (lines 131–136). Run with `pnpm icon:icns`.
  Key excerpt (lines 95–107):

  ```js
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
  ```

- `index.html` — head has (lines 8–12):

  ```html
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="theme-color" content="#faf9f7" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  ```

  and a body inline pre-paint script that sets
  `document.documentElement.dataset.theme` from `prefers-color-scheme`
  before React loads.

- `public/manifest.webmanifest` — `icons` array has only the SVG entry;
  `theme_color`/`background_color` are `#faf9f7`.

- `src/renderer/lib/use-theme.ts` — `useApplyTheme()` resolves the saved
  preference (light/dark/system) and sets
  `document.documentElement.dataset.theme` in `apply()` (lines 21–27),
  reacting live to OS changes when preference is `system`.

- Note: `scripts/build-icon.mjs` (a DIFFERENT script) still rasterizes the
  legacy `build/icon.svg` over `build/icon.png`; in the `pnpm package` flow
  this is immediately re-overwritten by `icon:icns`, so it's harmless drift
  — out of scope here, do not touch it.

Conventions: theme tokens live in `src/renderer/styles.css`
(`--color-canvas` light `oklch(98.8% 0.004 85)` ≙ `#faf9f7`, dark
`oklch(18% 0.006 80)` ≈ `#131110`). Comments explain intent.

## Commands you will need

| Purpose        | Command           | Expected on success |
|----------------|-------------------|---------------------|
| Install        | `pnpm install`    | exit 0              |
| Typecheck      | `pnpm typecheck`  | exit 0              |
| Tests          | `pnpm test`       | all pass            |
| Icon pipeline  | `pnpm icon:icns`  | exit 0, "✔ wrote …icon.icns" (macOS only — uses `iconutil`) |
| Renderer build | `pnpm build:renderer` | exit 0          |

## Scope

**In scope** (the only files you should modify/create):
- `scripts/build-icns.mjs`
- `index.html`
- `public/manifest.webmanifest`
- `src/renderer/lib/use-theme.ts`
- `public/apple-touch-icon.png` (created — committed build output)
- `public/icon-512.png` (created — committed build output)

Regeneration side effects: running `pnpm icon:icns` rewrites
`build/icon.icns` and `build/icon.png` from the same deterministic source.
If `git status` shows them modified afterward, restore them
(`git checkout -- build/icon.icns build/icon.png`) so the commit stays
scoped; if restore leaves them modified, STOP.

**Out of scope**:
- `scripts/build-icon.mjs` and `build/icon.svg` — legacy pipeline, see note.
- `public/icon.svg` — keep as the browser-tab favicon.
- `apple-mobile-web-app-status-bar-style` — leave `default`; theme-color
  does the work on modern iOS. Do not switch to `black-translucent` (that
  would require top safe-area padding work).

## Git workflow

- Branch: `advisor/006-pinned-app-presence`
- Commit per step; short imperative messages.
- Do NOT push or open a PR.

## Steps

### Step 1: Emit full-bleed web icons from the icns script

In `scripts/build-icns.mjs`, the composite `svg` template hardcodes the
squircle clip. Parameterize it — replace the single template with a
function:

```js
function compositeSvg({ clip }) {
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
  xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${grad}
    ${layers.map((l) => l.shadowDef).join("\n")}
    <clipPath id="__squircle"><rect width="${SIZE}" height="${SIZE}"
      rx="${CORNER}" ry="${CORNER}"/></clipPath>
  </defs>
  <g ${clip ? 'clip-path="url(#__squircle)"' : ""}>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#__bg)"/>
    ${layers.map((l) => l.group).join("\n")}
  </g>
</svg>`;
}
const svg = compositeSvg({ clip: true });
```

(All existing uses of `svg` — the iconset loop and the 1024 preview —
keep using the clipped version, unchanged.)

Then, after the existing preview write and before the `rmSync`, add:

```js
// Full-bleed (unclipped) renders for the web app. iOS/Android apply their
// own corner masks to home-screen icons; baked transparent corners would
// be filled with black on iOS.
const fullBleed = compositeSvg({ clip: false });
for (const [rel, px] of [
  ["public/apple-touch-icon.png", 180],
  ["public/icon-512.png", 512],
]) {
  writeFileSync(
    resolve(root, rel),
    new Resvg(fullBleed, { fitTo: { mode: "width", value: px } }).render().asPng()
  );
  console.log(`✔ wrote ${rel}`);
}
```

Run `pnpm icon:icns`.

**Verify**: exit 0; `file public/apple-touch-icon.png public/icon-512.png`
→ `180 x 180` and `512 x 512` PNGs. Then
`git checkout -- build/icon.icns build/icon.png` and confirm
`git status --short` shows only in-scope files.

### Step 2: Reference the PNG icons

In `index.html`, replace the apple-touch-icon line:

```html
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

(keep `<link rel="icon" href="/icon.svg" …>` as-is).

In `public/manifest.webmanifest`, extend `icons` to:

```json
"icons": [
  { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png", "purpose": "any" }
]
```

**Verify**: `pnpm build:renderer` → exit 0, and
`ls dist/renderer/apple-touch-icon.png dist/renderer/icon-512.png` → both
exist (Vite copies `public/` to the build root).

### Step 3: Dark-aware theme-color, pre-React

In `index.html`, extend the existing inline pre-paint script so the same
`prefersDark` check also fixes the status-bar color before React loads:

```html
<script>
  // Pre-paint: pick light/dark from the OS so there's no flash before
  // the React app loads the user's saved preference and possibly
  // overrides this. Also point theme-color at the right canvas tone —
  // use-theme.ts refines it to the exact computed color after load.
  try {
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
    if (prefersDark) {
      var tc = document.querySelector('meta[name="theme-color"]');
      if (tc) tc.setAttribute("content", "#131110"); // ≈ oklch(18% 0.006 80)
    }
  } catch (_) {}
</script>
```

**Verify**: `pnpm build:renderer` → exit 0.

### Step 4: Keep theme-color in sync at runtime

In `src/renderer/lib/use-theme.ts`, inside `apply()` after the
`dataset.theme` assignment, sync the meta from the actually-resolved canvas
color (so a Settings theme flip moves the status bar too, with no
hardcoded hex drift):

```ts
function apply() {
  const resolved =
    preference === "system" ? (mql.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;

  // Status bar / browser chrome follows the canvas. Read the resolved
  // color from the DOM rather than duplicating token values here.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) meta.content = bg;
  }
}
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

## Test plan

No new automated tests (asset + head-metadata change; no component-test
rig). `pnpm test` must still pass. Visual acceptance is the reviewer's:
re-pin the app on an iPhone and confirm the sunrise icon appears; toggle
dark mode and confirm the status bar area darkens.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0; `pnpm build:renderer` exits 0
- [ ] `file public/apple-touch-icon.png` → PNG, 180 x 180; `file public/icon-512.png` → PNG, 512 x 512
- [ ] `grep -n "apple-touch-icon" index.html` → references `/apple-touch-icon.png`, not `/icon.svg`
- [ ] `grep -c "icon-512.png\|apple-touch-icon.png" public/manifest.webmanifest` → 2
- [ ] `grep -n "theme-color" src/renderer/lib/use-theme.ts` → ≥1 match
- [ ] `git status` shows only in-scope files modified/added (build/ restored)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm icon:icns` fails (e.g. `iconutil` unavailable — non-macOS machine)
  — the PNGs can't be generated; report rather than hand-drawing assets.
- The generated `apple-touch-icon.png` has transparent corners (inspect:
  full-bleed render must be a full square) — would mean the clip
  parameterization didn't take.
- `git checkout -- build/icon.icns build/icon.png` leaves them modified.
- The `meta[name="theme-color"]` querySelector pattern conflicts with a
  second theme-color meta already added by other work (there must be
  exactly one).

## Maintenance notes

- After editing the icon in Icon Composer, `pnpm icon:icns` now refreshes
  the web icons too — commit the regenerated `public/*.png` alongside
  `build/icon.icns`.
- `getComputedStyle(...).backgroundColor` may serialize as `oklch(…)` in
  some engines; browsers that parse theme-color with the full CSS color
  parser handle it, and the inline-script static values remain the
  fallback. If a reviewer sees a white status bar in dark mode on a real
  device, the fix is to convert to hex in `apply()` — noted, not needed
  until observed.
- Deferred: `black-translucent` status bar + top safe-area padding for a
  fully edge-to-edge feel; bigger change, separate decision.
