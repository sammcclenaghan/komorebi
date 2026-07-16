# Plan 007: iOS-style swipe actions on Today's checklist rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd838ce..HEAD -- src/renderer/components/ChecklistRow.tsx src/renderer/styles.css src/lib`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (hand-rolled gesture code on the hottest UI path)
- **Depends on**: none (written against merged main `bd838ce`)
- **Category**: feature (UI / touch)
- **Planned at**: commit `bd838ce`, 2026-07-16

## Why this matters

The app's primary surface is Today's checklist on a pinned iPhone web app,
but the two most common actions are second-class on touch: completing
requires hitting the (hit-target-expanded but still small) checkbox, and
skipping isn't available on the row at all — the skip button is
hover-revealed and deliberately hidden on touch (`ChecklistRow.tsx`
comments the reason), so phone users must open the detail page to skip.

This plan adds the canonical iOS pattern: **swipe right to complete, swipe
left to skip-and-regenerate**, with a colored action layer revealed behind
the row, commit on distance-or-velocity (a quick flick is enough),
resistance when swiping where no action exists, and interruptible
snap-back. Touch pointers only — desktop keeps its hover affordances and
must be completely unaffected.

## Current state

- `src/renderer/components/ChecklistRow.tsx` — the row. Facts you need:
  - Mutations already exist in the component with optimistic updates and
    rollback: `setStatus` (done/pending), `skipRegen`
    (skip-and-regenerate). The checkbox's click handler
    (lines ~92–97) is the exemplar for completing:

    ```tsx
    onClick={(e) => {
      e.stopPropagation();
      if (isSkipped) return;
      if (!isDone) setBurstKey((k) => k + 1);
      setStatus.mutate(isDone ? "pending" : "done");
    }}
    ```

  - The root element (lines ~80–89) is an `<article>` with classes:

    ```tsx
    <article
      className={cn(
        "group relative flex items-start gap-4 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5",
        "pressable-row hover:border-[var(--color-rule-2)] hover:bg-[var(--color-panel-hover)]",
        "active:border-[var(--color-rule-2)] active:bg-[var(--color-panel-hover)]",
        ...
    ```

    `.pressable-row` (styles.css) transitions `transform` and applies
    `scale(0.99)` on `:active` — an inline `transform` set during a drag
    overrides it; the inline style must be REMOVED (not set to
    `translateX(0)`) once the row is at rest so press feedback returns.
  - The row contains nested buttons (checkbox, the flex-1 open button,
    hover-only skip/rating buttons). A swipe must not fire their `click`.
- `src/renderer/styles.css` — tokens `--color-accent`, `--color-panel-2`,
  `--color-ink-2`, `--color-canvas`; easing token `--ease-out-strong`;
  a reduced-motion section at the end of the file overriding keyframes.
  Global `button, a, [role="button"] { touch-action: manipulation; }` at
  ~line 158.
- `src/lib/cn.ts` + `src/lib/cn.test.ts` — the repo's test exemplar
  (vitest, colocated `*.test.ts`). `pnpm test` runs vitest.
- No motion/gesture library is installed and none should be added.

Conventions: colors only via `var(--color-*)`; comments explain intent,
not mechanics; icon components from `lucide-react` (already imported in
ChecklistRow: `Check`, `RotateCw`, `Loader2`, …).

## Commands you will need

| Purpose   | Command               | Expected on success |
|-----------|-----------------------|---------------------|
| Install   | `pnpm install`        | exit 0              |
| Typecheck | `pnpm typecheck`      | exit 0              |
| Tests     | `pnpm test`           | all pass (8 existing + new) |
| Build     | `pnpm build:renderer` | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `src/renderer/components/SwipeRow.tsx` (create)
- `src/renderer/lib/swipe.ts` (create — pure commit-decision helper)
- `src/renderer/lib/swipe.test.ts` (create)
- `src/renderer/components/ChecklistRow.tsx` (integrate)
- `src/renderer/styles.css` (only: one reduced-motion addition, Step 4)

**Out of scope**:
- History rows (`pages/History.tsx`) — read-only rows, no swipe.
- `SuggestionDetail.tsx`, `MobileNav.tsx`, `GeneratingRow.tsx`.
- Desktop/mouse drag behavior — gestures are `pointerType === "touch"` only.
- Adding any dependency.

## Git workflow

- Branch: `advisor/007-swipe-actions`
- Commit per step; short imperative messages.
- Do NOT push or open a PR.

## Steps

### Step 1: Pure commit-decision helper + test

Create `src/renderer/lib/swipe.ts`:

```ts
/** Gesture tuning for row swipe actions. Distances in px, time in ms. */
export const SWIPE = {
  /** Horizontal movement before we treat the touch as a swipe, not a tap/scroll. */
  intentPx: 10,
  /** Drag distance that commits the action on release. */
  commitPx: 72,
  /** A flick commits from this distance if it's fast enough. */
  flickMinPx: 24,
  /** px/ms — flick speed that commits without reaching commitPx. */
  flickVelocity: 0.3,
  /** The row never translates further than this. */
  maxPx: 112,
  /** Resistance divisor when dragging toward a side with no action. */
  resistance: 3,
} as const;

/** Should releasing at `dx` px after `elapsedMs` commit the action? */
export function shouldCommitSwipe(dx: number, elapsedMs: number): boolean {
  const abs = Math.abs(dx);
  if (abs >= SWIPE.commitPx) return true;
  if (abs < SWIPE.flickMinPx || elapsedMs <= 0) return false;
  return abs / elapsedMs >= SWIPE.flickVelocity;
}
```

Create `src/renderer/lib/swipe.test.ts` modeled on `src/lib/cn.test.ts`
(vitest `describe/it/expect`), covering at least: past-commitPx commits
regardless of time; slow drag under commitPx doesn't commit; fast flick
≥ flickMinPx commits; fast flick under flickMinPx doesn't; zero/negative
elapsed doesn't divide-by-zero; negative dx (left swipe) mirrors positive.

**Verify**: `pnpm test` → all pass, including the new file.

### Step 2: The SwipeRow component

Create `src/renderer/components/SwipeRow.tsx` — a wrapper that slides its
child horizontally over an action layer. Design contract:

```tsx
import { useRef } from "react";
import { cn } from "~/lib/cn";
import { SWIPE, shouldCommitSwipe } from "../lib/swipe";

type SwipeSideAction = {
  /** Rendered in the revealed layer (icon + optional label). */
  content: React.ReactNode;
  /** Background classes for the revealed layer, e.g. "bg-[var(--color-accent)]". */
  className: string;
  onTrigger: () => void;
};

type Props = {
  /** Revealed when swiping RIGHT (sits on the left edge). */
  leftAction?: SwipeSideAction;
  /** Revealed when swiping LEFT (sits on the right edge). */
  rightAction?: SwipeSideAction;
  disabled?: boolean;
  /** Matches the child's rounding so the revealed layer's corners align. */
  className?: string;
  children: React.ReactNode;
};
```

Implementation requirements (all of these are load-bearing):

1. **Structure**: outer `<div>` `relative overflow-hidden` + `className`
   (caller passes `rounded-xl`), containing (a) an absolutely-positioned
   action layer (`absolute inset-0 flex`) — left action zone
   `justify-start` and right action zone `justify-end ml-auto`, each with
   its `className` background, icon padded `px-5`, and visibility toggled
   by drag direction — and (b) the sliding child wrapper `<div>`
   (`relative`, `touch-action: pan-y` via inline style) that receives the
   pointer handlers and the inline `transform`.
2. **Pointer protocol** (on the sliding wrapper):
   - `onPointerDown`: ignore unless `e.pointerType === "touch"`, not
     `disabled`, and no gesture already active (multi-touch protection:
     track the active `pointerId` in a ref; ignore other pointers).
     Record `startX/startY/t0`. Do NOT capture yet.
   - `onPointerMove`: if not the active pointer, return. Before intent:
     if `|dy| > SWIPE.intentPx` first, abandon (let the page scroll);
     if `|dx| > SWIPE.intentPx` and `|dx| > |dy|`, lock in:
     `setPointerCapture(e.pointerId)`, mark dragging. While dragging:
     compute `dx`; if the target direction has no action, divide by
     `SWIPE.resistance`; clamp to `±SWIPE.maxPx`; write
     `el.style.transform = \`translateX(${dx}px)\`` and
     `el.style.transition = "none"` **directly on the DOM node via a ref —
     not through React state** (a re-render per move is jank). Toggle a
     `data-past-threshold` attribute when `|dx| >= SWIPE.commitPx` so the
     action layer can scale its icon up via CSS (feedback that release
     will commit).
   - `onPointerUp` / `onPointerCancel`: if dragging, decide with
     `shouldCommitSwipe(dx, elapsed)` — dx here is the *resisted* value
     only when no action exists (which can never commit — guard: only
     commit when an action exists in that direction). On commit: call
     `onTrigger()` immediately (the row's optimistic update restyles it),
     then animate home: set
     `el.style.transition = "transform 200ms var(--ease-out-strong)"` and
     `transform = "translateX(0)"`. On no-commit: same snap-home
     animation. In both cases, on the wrapper's `transitionend` (or a
     250ms fallback timeout), REMOVE the inline `transform` and
     `transition` so `.pressable-row`'s press feedback works again.
     Clear the active-pointer ref.
   - **Click suppression**: if a drag happened, set a `suppressClick` ref;
     on the outer div's `onClickCapture`, if set:
     `e.preventDefault(); e.stopPropagation();` and clear it. This stops
     the child open-button firing after a swipe.
3. **No gesture state in React state.** Everything lives in refs; the only
   React-rendered variance is the static action layer markup.
4. When `disabled` or neither action is provided, render children in the
   same wrapper structure with handlers inert — the DOM shape must not
   change between enabled/disabled (prevents remount flicker when a row
   transitions to done).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Integrate into ChecklistRow

In `src/renderer/components/ChecklistRow.tsx`:

1. Extract the checkbox's completion behavior into a function inside the
   component so the swipe can reuse it exactly:

   ```tsx
   function complete() {
     setBurstKey((k) => k + 1);
     setStatus.mutate("done");
   }
   ```

   (checkbox handler calls `complete()` for the not-done case, keeps its
   existing undo case unchanged).
2. Wrap the `<article>` in `SwipeRow`:

   ```tsx
   <SwipeRow
     className="rounded-xl"
     disabled={isDone || isSkipped}
     leftAction={{
       content: <Check className="h-4 w-4" strokeWidth={3} />,
       className: "bg-[var(--color-accent)] text-[var(--color-canvas)]",
       onTrigger: complete,
     }}
     rightAction={{
       content: <RotateCw className="h-4 w-4" strokeWidth={2} />,
       className: "bg-[var(--color-panel-2)] text-[var(--color-ink-2)]",
       onTrigger: () => skipRegen.mutate(),
     }}
   >
     <article ...unchanged...>
   </SwipeRow>
   ```

   Swipe is pending-rows only (`disabled={isDone || isSkipped}`): done and
   skipped rows keep their existing affordances (undo lives in the detail
   view), and this avoids accidental re-triggers while the list settles.

**Verify**: `pnpm typecheck` → exit 0; `pnpm build:renderer` → exit 0.

### Step 4: Threshold feedback + reduced motion

In `src/renderer/styles.css`, at the end of `@layer components`, add:

```css
/* Swipe-action layer: icon grows slightly once the drag passes the
   commit threshold, so release-will-commit is visible. */
.swipe-action-icon {
  transition: transform 150ms var(--ease-out-strong);
}
[data-past-threshold="true"] .swipe-action-icon {
  transform: scale(1.25);
}
```

(SwipeRow wraps each action's `content` in
`<span className="swipe-action-icon">`.)

And inside the existing `@media (prefers-reduced-motion: reduce)` block at
the end of the file, add:

```css
  /* Swipe rows snap instead of animating home. */
  .swipe-slider {
    transition-duration: 0.01ms !important;
  }
```

(SwipeRow puts `swipe-slider` on the sliding wrapper; the icon-scale rule
above is transform-only feedback and may also be neutralized — acceptable
either way.)

**Verify**: `pnpm build:renderer` → exit 0; `pnpm typecheck` → exit 0;
`pnpm test` → all pass.

## Test plan

- `src/renderer/lib/swipe.test.ts` (Step 1): the six listed cases minimum,
  modeled structurally on `src/lib/cn.test.ts`.
- Gesture handling itself is not unit-tested (no DOM/gesture rig in the
  repo — do not add one for this).
- Manual acceptance is the reviewer's/owner's, on a real iPhone:
  swipe right completes (burst plays, row dims), swipe left skips and a
  replacement composes, half-swipe springs back, quick flick commits,
  vertical scrolling over rows still scrolls, tapping a row still opens
  the detail, tapping right after a swipe does NOT open the detail, and
  desktop mouse interactions are completely unchanged.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm build:renderer` exits 0
- [ ] `pnpm test` exits 0 with ≥ 6 new assertions in `swipe.test.ts`
- [ ] `grep -n "pointerType" src/renderer/components/SwipeRow.tsx` → ≥1
      (touch-only gate present)
- [ ] `grep -n "setPointerCapture" src/renderer/components/SwipeRow.tsx` → ≥1
- [ ] `grep -rn "framer-motion\|motion/react" package.json src/` → no matches
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `ChecklistRow.tsx` no longer matches the excerpts (drift).
- The click-suppression approach fails in your reasoning for some child
  (e.g. a button using `onPointerUp` instead of `onClick`) — report the
  conflict; do not restructure the row's buttons.
- You find yourself wanting `useState` for per-move gesture position —
  that's the jank path; re-read Step 2 requirement 3, and if the ref
  approach genuinely cannot work, STOP and explain.
- Any step needs a new dependency.

## Maintenance notes

- Tuning lives in one place (`SWIPE` in `src/renderer/lib/swipe.ts`);
  feel adjustments (threshold, flick velocity, resistance) should happen
  there, not scattered in the component.
- If rows later become removable-on-complete (slide-out instead of
  settle-back), the commit animation in SwipeRow is the extension point.
- Reviewer: scrutinize pointer-capture cleanup on `pointercancel` (iOS
  fires it when the system claims the gesture, e.g. edge-swipe back) and
  the inline-style removal after settle (press feedback must return).
- Deferred: swipe on done rows for undo; haptics (no iOS web API).
