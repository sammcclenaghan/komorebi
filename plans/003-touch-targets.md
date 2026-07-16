# Plan 003: Bring every phone-visible control up to a comfortable tap size

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- src/renderer/pages/Settings.tsx src/renderer/pages/Goals.tsx src/renderer/pages/Integrations.tsx src/renderer/pages/SuggestionDetail.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI / touch)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

The primary way this app is used is pinned to an iPhone home screen, and the
repo already ships the tool for this — `.hit-target`
(`src/renderer/styles.css:181–189`) expands a small control's tappable area
by 13px per side without changing its visual size, and `ChecklistRow` uses
it on its 18px checkbox. But a handful of persistent, phone-visible controls
sit at 18–32px with nothing: the Settings schedule toggle, theme picker,
model preset chips, the goal card's edit/delete buttons (which a code
comment says are "always visible on touch" precisely because touch is a
first-class input), the Integrations clear-search button, and the rating
thumbs in the suggestion detail. On a phone these are misses-and-retries.
One of them (`RatingButton`) is also an icon-only button with **no
aria-label**, which the repo's own `IconButton` primitive makes mandatory.

## Current state

Design rule being applied: interactive elements need ~40–44px of effective
tap area. Two mechanisms, chosen per control:

- `.hit-target` — invisible expansion; **only safe when neighbors are ≥
  ~26px apart**, because the ::before pseudo expands 13px each side and
  overlapping hit areas steal each other's taps.
- Real padding — for controls inside tight clusters (segmented pickers,
  adjacent chips) where `.hit-target` would overlap.

The controls and their current sizes:

| Control | Location | Current size | Mechanism to use |
|---|---|---|---|
| Schedule Toggle | `Settings.tsx:365–393` (`h-[24px] w-[42px]` at 381) | 24px tall | `.hit-target` (sits alone in its Row) |
| Theme picker buttons | `Settings.tsx:240–258` (`px-2.5 py-1.5 text-sm`) | ~30px tall | padding: `py-1.5` → `py-2` (adjacent buttons — no `.hit-target`) |
| Model preset chips | `Settings.tsx:312–329` (`px-1.5 py-0.5 text-2xs`) | ~19px tall | padding: `px-2 py-1.5` (adjacent chips — no `.hit-target`) |
| Goal edit/delete IconButtons | `Goals.tsx` GoalCard actions (~lines 130–150; `IconButton size="md"` ≈ 26px) | ~26px | `.hit-target` is unsafe (two adjacent) — bump to a dedicated class `h-9 w-9` (36px) on both IconButtons; visual grows slightly, acceptable |
| Clear-search button | `Integrations.tsx:73–79` (`p-1` + 12px icon) | ~20px | `.hit-target` (isolated inside the input) |
| RatingButton thumbs | `SuggestionDetail.tsx:311–333` (`p-1.5` + 12px icon) | ~24px | padding `p-2.5` + `h-3.5 w-3.5` icons (two adjacent, gap-1) |

`RatingButton` (`SuggestionDetail.tsx:311–333`) is icon-only and lacks
`aria-label` and `aria-pressed`. Its sibling implementation `RatingThumb`
(`ChecklistRow.tsx:248–288`) has both — use its labels verbatim:
`aria-label={kind === "up" ? "Rate good" : "Rate poor"}` and
`aria-pressed={active}`.

Excerpt — the exemplar this plan follows, `ChecklistRow.tsx:100`:

```tsx
className={cn(
  "pressable-sm hit-target flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px]",
```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Web dev   | `pnpm dev:web`   | Vite dev server URL |

## Scope

**In scope** (the only files you should modify):
- `src/renderer/pages/Settings.tsx`
- `src/renderer/pages/Goals.tsx`
- `src/renderer/pages/Integrations.tsx`
- `src/renderer/pages/SuggestionDetail.tsx`

**Out of scope**:
- `src/renderer/components/ChecklistRow.tsx` — its hover-only controls are
  deliberately hidden on touch (see comments at lines 171–174, 269–271);
  do not "fix" them.
- `src/renderer/components/MobileNav.tsx` — tab buttons are already
  full-height flex-1 targets.
- `src/renderer/styles.css` — `.hit-target` is used as-is.
- History heatmap cells — handled in plan 002.

## Git workflow

- Branch: `advisor/003-touch-targets`
- One commit per file or one combined commit; short imperative message.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Settings controls

In `src/renderer/pages/Settings.tsx`:

1. `Toggle` (line ~381): add `hit-target` to the button's `cn(...)` list.
2. `ThemePicker` buttons (line ~248): change `py-1.5` → `py-2`.
3. `ModelField` preset chips (line ~321): change `px-1.5 py-0.5` → `px-2 py-1.5`.

**Verify**: `pnpm typecheck` → exit 0. Visual: theme picker and chips grow
slightly but stay aligned; nothing wraps at 375px width.

### Step 2: Goals card actions

In `src/renderer/pages/Goals.tsx`, find the GoalCard's edit/delete
`IconButton`s (search `Pencil` / `Trash2`). Add `className="h-9 w-9"` to
both (IconButton merges className via `cn`). If they already have a
className, append the sizes to it.

**Verify**: `pnpm typecheck` → exit 0; both buttons render 36×36px
(devtools), icons stay centered.

### Step 3: Integrations clear-search

In `src/renderer/pages/Integrations.tsx` (line ~73, the button with
`aria-label="Clear search"`): add `hit-target` to its class list.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: SuggestionDetail rating thumbs

In `src/renderer/pages/SuggestionDetail.tsx`, `RatingButton` (line ~311):

- `p-1.5` → `p-2.5` in the button classes.
- Bump the two icons at the call sites (lines ~269, ~272) from `h-3 w-3` to
  `h-3.5 w-3.5`.
- Add props: the component currently takes `{ active, onClick, children }`.
  Add `"aria-label": string` to its props and spread it onto the button,
  plus `aria-pressed={active}`. At the call sites pass
  `aria-label="Rate good"` / `aria-label="Rate poor"` (matching
  `RatingThumb` in ChecklistRow).

**Verify**: `pnpm typecheck` → exit 0 (the new required prop will surface
any missed call site as a type error).

## Test plan

No new automated tests (no component-test rig). Manual pass: in `pnpm
dev:web` with iPhone emulation, tap each modified control 5 times in a row
— every tap should land. `pnpm test` must still pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -n "hit-target" src/renderer/pages/Settings.tsx src/renderer/pages/Integrations.tsx` → ≥2 matches
- [ ] `grep -n "aria-pressed" src/renderer/pages/SuggestionDetail.tsx` → ≥1 match
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any listed control has moved or been rewritten (drift check fails).
- Growing the theme picker or chips causes wrapping/overflow at 375px —
  report the layout constraint rather than shrinking something else.
- You find `.hit-target`'s definition changed in `styles.css` (inset other
  than -13px) — the adjacency math above would be wrong.

## Maintenance notes

- Any new icon-only control should go through `IconButton` (which makes
  `aria-label` required) and get `.hit-target` when isolated, padding when
  clustered. Reviewers: check tap size on every new control in PRs.
- Deferred: consolidating `RatingButton` (SuggestionDetail) and
  `RatingThumb` (ChecklistRow) into one component — owner has deprioritized
  refactors; noted in plans/README.md.
