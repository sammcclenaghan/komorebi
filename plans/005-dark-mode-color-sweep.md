# Plan 005: Route the remaining hardcoded colors through theme tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- src/renderer/components/ChecklistRow.tsx src/renderer/components/MediaEmbed.tsx src/renderer/components/IntegrationCard.tsx src/renderer/styles.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches `styles.css` like 002/004 — coordinate merges)
- **Category**: bug (UI / theming)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

The design system promises "warm-tinted neutrals so the app keeps its paper
feel" in dark mode (the Settings copy even advertises it), and nearly all
color flows through `--color-*` tokens with light and dark values. Three
spots bypass the tokens with raw light-theme oklch values, so they don't
adapt when the theme flips: the completion burst's green flecks, the video
embed's play-button scrim, and the integration card's hover shadow. Each is
a small visible seam in an otherwise cohesive dark theme.

(The History heatmap scale — the biggest offender — is handled in plan 002.
The Settings toggle's white knob and the danger button's white text were
reviewed and are correct in both themes; do not change them.)

## Current state

- `src/renderer/styles.css` — tokens: `@theme` (lines 3–59) for light,
  `:root[data-theme="dark"]` (lines 63–86) for dark. `--color-overlay`
  already exists for scrims (light: `oklch(20% 0.01 60 / 0.18)`, dark:
  `oklch(0% 0 0 / 0.55)`).
- `src/renderer/components/ChecklistRow.tsx:232–235` — the burst particles:

  ```tsx
  background: warm
    ? "oklch(78% 0.13 130)"
    : "var(--color-accent)",
  ```

- `src/renderer/components/MediaEmbed.tsx:62` — the play overlay:

  ```tsx
  <span className="absolute inset-0 bg-[oklch(20%_0.02_60/0.18)] transition-colors group-hover:bg-[oklch(20%_0.02_60/0.30)] group-active:bg-[oklch(20%_0.02_60/0.35)]" />
  ```

- `src/renderer/components/IntegrationCard.tsx:71` — hover shadow with a
  fixed dark tint:

  ```tsx
  "hover:border-[var(--color-rule-2)] hover:shadow-[0_1px_2px_oklch(20%_0.01_60/0.04),0_4px_12px_-2px_oklch(20%_0.01_60/0.06)]",
  ```

Convention: one token per semantic role, light value in `@theme`, dark
value in the `:root[data-theme="dark"]` block, with a one-line comment.
Exemplar: the `--color-overlay` pair (styles.css:31–33 and 83).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Web dev   | `pnpm dev:web`   | Vite dev server URL |

## Scope

**In scope** (the only files you should modify):
- `src/renderer/styles.css` (new tokens only)
- `src/renderer/components/ChecklistRow.tsx`
- `src/renderer/components/MediaEmbed.tsx`
- `src/renderer/components/IntegrationCard.tsx`

**Out of scope**:
- `src/renderer/pages/History.tsx` — plan 002 owns its colors.
- `Settings.tsx` toggle knob (`bg-white`) and `Button.tsx` danger
  `text-white` — verified correct in both themes; leave them.
- Modal/WeatherTooltip drop shadows — hardcoded dark oklch, but shadows are
  naturally invisible-ish on dark canvases and both cards carry borders;
  acceptable as-is.

## Git workflow

- Branch: `advisor/005-dark-mode-color-sweep`
- One commit; short imperative message.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add tokens

In `styles.css` `@theme` (near the accent tokens):

```css
/* Leaf-green used by the completion burst — the one non-accent celebratory hue. */
--color-leaf: oklch(78% 0.13 130);
/* Scrim steps for media overlays (rest / hover / pressed). */
--color-scrim: oklch(20% 0.02 60 / 0.18);
--color-scrim-hover: oklch(20% 0.02 60 / 0.3);
--color-scrim-active: oklch(20% 0.02 60 / 0.35);
/* Ambient shadow tint for hover elevation. */
--color-shadow: oklch(20% 0.01 60);
```

In `:root[data-theme="dark"]`:

```css
--color-leaf: oklch(72% 0.12 130);
--color-scrim: oklch(0% 0 0 / 0.3);
--color-scrim-hover: oklch(0% 0 0 / 0.45);
--color-scrim-active: oklch(0% 0 0 / 0.55);
--color-shadow: oklch(0% 0 0);
```

**Verify**: `pnpm typecheck` → exit 0 (CSS-only; typecheck is the cheap
smoke test that the build still parses imports).

### Step 2: Consume the tokens

1. `ChecklistRow.tsx:234` — `"oklch(78% 0.13 130)"` → `"var(--color-leaf)"`.
2. `MediaEmbed.tsx:62` — replace the three arbitrary-value classes:
   `bg-[oklch(20%_0.02_60/0.18)]` → `bg-[var(--color-scrim)]`,
   `group-hover:bg-[oklch(20%_0.02_60/0.30)]` → `group-hover:bg-[var(--color-scrim-hover)]`,
   `group-active:bg-[oklch(20%_0.02_60/0.35)]` → `group-active:bg-[var(--color-scrim-active)]`.
3. `IntegrationCard.tsx:71` — replace the two shadow color literals with
   `oklch(from var(--color-shadow) l c h / 0.04)`-style syntax is NOT
   supported in Tailwind arbitrary shadows reliably; instead use the
   simpler form — define the whole shadow as classes with the tint via
   color-mix:
   `hover:shadow-[0_1px_2px_color-mix(in_oklab,var(--color-shadow)_4%,transparent),0_4px_12px_-2px_color-mix(in_oklab,var(--color-shadow)_6%,transparent)]`.
   (Underscores replace spaces inside Tailwind arbitrary values — keep them
   exactly as written.)

**Verify**: `grep -rn "oklch(" src/renderer/components/ChecklistRow.tsx src/renderer/components/MediaEmbed.tsx src/renderer/components/IntegrationCard.tsx` → no matches. `pnpm typecheck` → exit 0.

### Step 3: Visual pass in both themes

`pnpm dev:web`: complete a checklist item in light and dark (burst flecks
read as leaf-green in both, slightly muted in dark); open a suggestion with
a video embed in dark (scrim darkens, doesn't gray out); hover an
integration card in dark (no pale halo).

**Verify**: all three observations hold; no console warnings about invalid
CSS.

## Test plan

No new automated tests. `pnpm test` must still pass; Step 3 is the
acceptance check.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -rln "oklch(" src/renderer/components/` → no matches
- [ ] `grep -c "color-leaf\|color-scrim\|color-shadow" src/renderer/styles.css` → 10
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `color-mix` inside the Tailwind arbitrary shadow doesn't compile or
  renders no shadow — report; fall back is to leave IntegrationCard
  unchanged (it's the least visible of the three), not to invent new CSS.
- The cited lines have drifted (drift check fails).

## Maintenance notes

- Rule for reviewers going forward: any `oklch(`/hex/named color in a
  component file is a defect — colors live in `styles.css` with a dark
  counterpart. `grep -rn "oklch(" src/renderer/components src/renderer/pages`
  should stay clean (pages: after plan 002 lands).
- If a toast/notification system is added later, reuse `--color-scrim*`
  rather than minting new overlay values.
