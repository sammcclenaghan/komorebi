# Plan 002: Make the History heatmap dark-mode correct and pleasant to use on the phone

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- src/renderer/pages/History.tsx src/renderer/styles.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

History is one of the five main pages and the primary use of this app is a
pinned iPhone web app. The heatmap has four problems, in priority order:

1. **Dark mode is broken.** Intensity levels 1–3 are hardcoded light-theme
   oklch values; in dark mode they render as glaring pastel-blue squares on
   an 18%-lightness canvas while levels 0 and 4 (which use CSS variables)
   adapt correctly. The scale reads as random noise in dark mode.
2. **Touch interaction is poor.** Cells are 14×14px buttons — far below a
   usable tap size — and the only feedback is `hover:scale-125`, which on
   touch devices produces sticky-hover artifacts (the scale sticks to the
   last-tapped cell).
3. **Day switching feels slow.** Tapping a cell remounts the day detail with
   a 320ms `fade-up`. Browsing days is a rapid, repeated action — per the
   animation frequency rule it should be near-instant, and the keyframe
   restart on every tap makes quick scrubbing through days feel janky.
4. **Overflow risk.** The grid is ~326px of fixed-width columns with no
   horizontal-scroll container. It fits a 375px viewport with `px-5`
   padding, but anything narrower (split view, small Androids, future
   padding change) silently clips the newest weeks — the most important ones.

## Current state

- `src/renderer/pages/History.tsx` — the whole page: heatmap grid, legend,
  selected-day detail. Key locations:
  - `LEVEL_BG` (lines 284–290) — the broken color scale:

    ```tsx
    const LEVEL_BG = [
      "var(--color-panel-2)",
      "oklch(89% 0.03 245)",
      "oklch(80% 0.065 245)",
      "oklch(66% 0.095 245)",
      "var(--color-accent)"
    ];
    ```

  - Cell button (lines 152–163):

    ```tsx
    className={cn(
      "h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125 active:scale-90",
      cell.iso === selectedDate &&
        "ring-[1.5px] ring-[var(--color-ink)] ring-offset-1 ring-offset-[var(--color-canvas)]"
    )}
    ```

  - Grid layout (lines 127–184): month labels row (`pl-[24px]`, `w-[18px]`
    per column), weekday label column (`w-[20px]` + `mr-[4px]`), columns of
    cells with `gap-[4px]`, legend row. No `overflow-x` container.
  - Day detail (lines 89–101): `<DayBlock key={selectedDate} ... style={{ animation: "fade-up 320ms ease-out" }}>`
    and `<SelectedEmpty key={selectedDate} ...>` with the same 320ms
    animation at line 211.
- `src/renderer/styles.css` — design tokens. Light palette in `@theme`
  (lines 3–59), dark overrides under `:root[data-theme="dark"]`
  (lines 63–86). The accent family: light `--color-accent: oklch(52% 0.11 245)`,
  dark `--color-accent: oklch(72% 0.12 245)`.

Conventions that apply:

- Every color goes through a `--color-*` CSS variable with a light value in
  `@theme` and a dark value in `:root[data-theme="dark"]`. Follow the
  existing accent-family naming (`--color-accent-soft`, `--color-accent-tint`).
- Press feedback uses the `.pressable*` classes (`styles.css:156–179`);
  hover-only effects elsewhere in the app are gated with
  `[@media(hover:hover)]` (see `src/renderer/components/ChecklistRow.tsx:174`
  for the exemplar).
- Animations: entrances use `fade-up`/`fade-in` keyframes (`styles.css:210–225`).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Web dev   | `pnpm dev:web`   | Vite dev server URL |

## Scope

**In scope** (the only files you should modify):
- `src/renderer/pages/History.tsx`
- `src/renderer/styles.css` (adding heat tokens only)

**Out of scope** (do NOT touch, even though they look related):
- `src/main/checklist/orchestrator.ts` (`getHistory`) — data shape is fine.
- `src/renderer/components/ChecklistRow.tsx` — its row styling resembles
  `HistoryRow` but consolidation is explicitly deferred.
- Any change to `WEEKS = 17` or the level-bucketing logic in `makeCell`.

## Git workflow

- Branch: `advisor/002-history-heatmap-polish`
- Commit per step; short imperative messages matching `git log --oneline`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tokenize the heatmap scale with dark values

In `src/renderer/styles.css`, add to the `@theme` block (after the accent
tokens, ~line 26):

```css
/* History heatmap intensity scale — level 0 is --color-panel-2,
   level 4 is --color-accent; these are the steps between. */
--color-heat-1: oklch(89% 0.03 245);
--color-heat-2: oklch(80% 0.065 245);
--color-heat-3: oklch(66% 0.095 245);
```

and to `:root[data-theme="dark"]` (after the accent overrides, ~line 79):

```css
--color-heat-1: oklch(32% 0.045 245);
--color-heat-2: oklch(44% 0.075 245);
--color-heat-3: oklch(57% 0.1 245);
```

(The dark ramp climbs in lightness toward the dark accent at 72%, mirroring
how the light ramp descends toward the light accent at 52%.)

In `History.tsx`, replace the three raw oklch strings in `LEVEL_BG` with
`"var(--color-heat-1)"`, `"var(--color-heat-2)"`, `"var(--color-heat-3)"`.

**Verify**: `grep -c "oklch" src/renderer/pages/History.tsx` → `0`, and
`pnpm typecheck` → exit 0.

### Step 2: Fix the cell interaction for touch

In the cell button's className (History.tsx:157–161):

- Gate the hover scale: `hover:scale-125` → `[@media(hover:hover)]:hover:scale-125`.
- Keep `active:scale-90` (it fires on touch and is the correct press cue).
- Add `hit-target` to the button's class list so the effective tap area
  grows toward 40px without changing the 14px visual. **Exception check**:
  `.hit-target` expands hits by 13px on every side, and neighboring cells
  are only 4px apart, so hits would overlap and steal taps. Do NOT use
  `.hit-target` here. Instead, enlarge what the finger actually touches:
  give the button `relative` and an `::after`-style expansion is not
  available inline — so use padding-based expansion: wrap the visual in the
  button. Concretely, restructure the cell to:

  ```tsx
  <button
    key={cell.iso}
    onClick={() => onSelect(cell.iso)}
    title={cellTitle(cell)}
    aria-label={cellTitle(cell)}
    aria-pressed={cell.iso === selectedDate}
    className="group/cell flex h-3.5 w-3.5 items-center justify-center"
  >
    <span
      className={cn(
        "h-3.5 w-3.5 rounded-[3px] transition-transform",
        "[@media(hover:hover)]:group-hover/cell:scale-125 group-active/cell:scale-90",
        cell.iso === selectedDate &&
          "ring-[1.5px] ring-[var(--color-ink)] ring-offset-1 ring-offset-[var(--color-canvas)]"
      )}
      style={{ background: LEVEL_BG[cell.level] }}
    />
  </button>
  ```

  This keeps the 18px grid pitch (14px + 4px gap) — the button itself stays
  14px, which is the honest maximum without overlapping neighbors. The real
  tap-usability win on phones comes from the scroll container in Step 3
  (stable grid, no page pan fighting the taps) and `active:scale-90`
  feedback confirming which cell was hit.

**Verify**: `pnpm typecheck` → exit 0. In `pnpm dev:web` with device
emulation (iPhone, touch), tapping cells shows no sticky scale-up.

### Step 3: Contain the grid in a right-anchored horizontal scroller

Wrap the grid block (month labels + rows + legend — the `<div>` opened at
History.tsx:128) in a scroll container:

```tsx
<div className="overflow-x-auto" dir="rtl">
  <div dir="ltr" className="w-fit">
    {/* existing month labels + grid + legend */}
  </div>
</div>
```

The `dir="rtl"` outer / `dir="ltr"` inner trick makes the scroller start
scrolled to the **right edge** (newest weeks, including today) with no
JavaScript, and is inert when content fits. Scrollbars are already hidden
globally (`styles.css:107–113`).

**Verify**: in `pnpm dev:web` with a 320px-wide viewport, the grid scrolls
horizontally, starts showing the newest (rightmost) weeks, and the page
itself never scrolls horizontally. At 390px nothing visibly changes.

### Step 4: Make day-switching feel instant

Browsing days is rapid and repeated; the entrance flourish belongs to the
page, not to every selection. In `History.tsx`:

- Line 96 (`DayBlock` style): `"fade-up 320ms ease-out"` → `"fade-in 150ms ease-out"`.
- Line 211 (`SelectedEmpty` section style): same replacement.

Keep the `key={selectedDate}` remounts (they restart the fade — at 150ms
opacity-only this is the desired subtle crossfade, with no vertical jump
while scrubbing).

**Verify**: `grep -n "fade-up 320ms" src/renderer/pages/History.tsx` → no
matches. In the browser, tapping rapidly across several cells feels
immediate; content no longer slides up on each tap.

## Test plan

No new automated tests — presentation-only change in a repo without a
component-test rig. Manual verification per step, plus one combined pass:
in `pnpm dev:web`, switch Settings → Theme → Dark and confirm all five
legend squares form a smooth dark ramp (panel → accent) and selected-cell
rings remain visible. `pnpm test` must still pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -c "oklch" src/renderer/pages/History.tsx` → 0
- [ ] `grep -n "color-heat" src/renderer/styles.css` → 6 lines (3 light + 3 dark)
- [ ] `grep -n "hover:scale-125" src/renderer/pages/History.tsx` shows the
      class only behind `[@media(hover:hover)]`
- [ ] Grid is inside an `overflow-x-auto` container
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `LEVEL_BG` or the cell button no longer match the excerpts (page reworked).
- The `dir="rtl"` scroll trick breaks month-label alignment in your visual
  check — report rather than invent an alternative scroll-anchoring scheme.
- Adding tokens to `styles.css` conflicts with concurrent edits from another
  plan (003/004 also touch that file) — rebase/merge, don't duplicate blocks.

## Maintenance notes

- Plan 004 adds global reduced-motion handling; the `fade-in` used here is
  opacity-only and already reduced-motion-friendly.
- Today's items are folded into the grid with `reflectionsByItem: {}`
  (History.tsx:45), so notes left today don't show in the day detail until
  tomorrow. Known, deferred — data plumbing, out of this UI pass.
- If `WEEKS` ever grows beyond ~19, the grid will overflow even at 390px;
  the Step 3 scroller makes that safe, but consider fading the left edge as
  an affordance.
