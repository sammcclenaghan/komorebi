# Plan 004: Motion polish — instant page switches, a real modal exit, reduced-motion support

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- src/renderer/App.tsx src/renderer/components/ui/Modal.tsx src/renderer/styles.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (Modal change touches shared chrome used by every dialog)
- **Depends on**: none (touches `styles.css` like 002 — coordinate merges)
- **Category**: bug (UI / motion)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

Three motion issues, judged by the frequency-and-purpose framework
(animate rare things, keep frequent things instant, exits faster than
entries, reduced motion means fewer/gentler, not zero):

1. **Every tab switch replays a 240ms slide-up.** `<main>` is keyed by view
   and its content animates `fade-up 240ms` on every navigation
   (`App.tsx:63, 72`). Switching tabs happens dozens of times a day — at
   that frequency the animation reads as latency, not polish. Opening a
   suggestion detail (occasional, a spatial "push") deserves the flourish;
   Today↔History↔Goals does not.
2. **Modals vanish with no exit.** `Modal` unmounts instantly on close
   (`Modal.tsx:40 — if (!open) return null`) after entering with a 200ms
   pop. An element that materializes with motion and then blinks out of
   existence feels broken; the exit should exist and be *faster* than the
   entry (~150ms).
3. **`prefers-reduced-motion` is almost entirely ignored.** Only
   `.motion-safe-pop` is remapped (`styles.css:236–240`). The completion
   particle burst, the all-caught-up ring pulses and scale-in, shimmer
   sweeps, and every `fade-up` still play for users whose OS asked for
   reduced motion.

This plan also registers the app's easing curves as named tokens so future
motion stays consistent.

## Current state

- `src/renderer/App.tsx:62–73` — keyed `<main>`; inner scroll div has
  `style={{ animation: "fade-up 240ms ease-out" }}`. `openSuggestionId`
  (line 21) distinguishes detail-push from tab-switch; `pageKey` (line 55)
  already encodes it (`suggestion:` vs `view:` prefix).
- `src/renderer/components/ui/Modal.tsx` — shared chrome for every dialog
  (GoalModal, ConfirmDialog). Enter: scrim `fade-in 180ms`, card
  `modal-pop 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards`. Exit: none.
- `src/renderer/styles.css` — keyframes at lines 200–299: `pulse-soft`,
  `fade-up`, `fade-in`, `modal-pop`, `shimmer`, `scale-in`, `draw-check`,
  `ring-pulse`, `leaf-burst`. The only reduced-motion rule is lines 236–240.
  The `@theme` block (lines 3–59) is where design tokens live.
- Animations are applied via **inline `style={{ animation: ... }}`**
  throughout the renderer — that's why the reduced-motion fix in Step 4
  overrides the *keyframes*, not the elements.

Conventions: tokens in `@theme` as CSS vars; comments explain intent
(see the existing keyframe comments); exits/entrances use ease-out.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Web dev   | `pnpm dev:web`   | Vite dev server URL |

## Scope

**In scope** (the only files you should modify):
- `src/renderer/App.tsx`
- `src/renderer/components/ui/Modal.tsx`
- `src/renderer/styles.css`

**Out of scope**:
- Component-level animation call sites (`AllCaughtUp.tsx`,
  `ChecklistRow.tsx`, `GeneratingRow.tsx`, etc.) — Step 4 handles them
  centrally via keyframe overrides; do not edit them.
- The sidebar width transition (`Sidebar.tsx`) — 200ms is acceptable;
  changing it is not part of this plan.
- History day-switch animation — plan 002 owns it.

## Git workflow

- Branch: `advisor/004-motion-polish`
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Register easing tokens

In `styles.css` `@theme` (after the type scale, before the closing brace):

```css
/* Motion — stronger curves than the CSS built-ins. ease-out-strong for
   entrances/exits, ease-in-out-strong for on-screen movement. */
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
```

Update `Modal.tsx:64` to use the token:
`animation: "modal-pop 200ms var(--ease-out-strong) backwards"`.

**Verify**: `pnpm typecheck` → exit 0; modal still pops in (dev check).

### Step 2: Keep the flourish for detail-push only

In `App.tsx`, the inner scroll div (lines 70–73): make the animation depend
on what kind of navigation happened —

```tsx
<div
  className="absolute inset-0 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0"
  style={{
    animation: openSuggestionId
      ? "fade-up 240ms var(--ease-out-strong)"
      : "fade-in 120ms ease-out",
  }}
>
```

Tab switches now crossfade in 120ms (fast enough to read as instant, still
masking the remount); opening a suggestion keeps the upward push that sells
"you went somewhere."

**Verify**: `pnpm typecheck` → exit 0. Dev check: switching tabs feels
immediate; opening a checklist item still slides up.

### Step 3: Give Modal a real exit

Rewrite the open/close lifecycle in `Modal.tsx` so the card animates out
before unmounting. Replace the `if (!open) return null;` early-return with
a three-phase state machine:

```tsx
const [phase, setPhase] = useState<"closed" | "open" | "closing">(
  open ? "open" : "closed"
);

useEffect(() => {
  if (open) setPhase("open");
  else setPhase((p) => (p === "open" ? "closing" : p));
}, [open]);

useEffect(() => {
  if (phase !== "closing") return;
  const t = setTimeout(() => setPhase("closed"), 150);
  return () => clearTimeout(t);
}, [phase]);

if (phase === "closed") return null;
const closing = phase === "closing";
```

Keep the existing Escape-key effect gated on `open` as-is. Then:

- Scrim div: add
  `style={{ animation: closing ? "none" : "fade-in 180ms ease-out", opacity: closing ? 0 : 1, transition: "opacity 150ms ease-out" }}`.
- Card div: replace the inline style with

  ```tsx
  style={
    closing
      ? {
          opacity: 0,
          transform: "scale(0.97) translateY(6px)",
          transition: "opacity 150ms ease-out, transform 150ms ease-out",
          pointerEvents: "none",
        }
      : { animation: "modal-pop 200ms var(--ease-out-strong) backwards" }
  }
  ```

Exit (150ms) is deliberately faster than entry (200ms), mirrors the entry
transform so it retraces its path, and uses transitions (interruptible: a
reopen mid-close snaps `phase` back to `"open"` cleanly because the `open`
effect runs on every change).

**Verify**: `pnpm typecheck` → exit 0. Dev check: open the Goal modal
(Goals → New goal), close via backdrop, Escape, and Cancel — all three exit
with a quick fade-down, none blink out. Rapidly toggle open/close — no
stuck invisible overlay (backdrop must not intercept clicks after close).

### Step 4: Honor prefers-reduced-motion everywhere

Because animations are applied via inline styles, override the *keyframes*
under the media query. In `styles.css`, replace the existing block at lines
236–240 with a full section placed **after all keyframe definitions**
(order matters — later declarations win):

```css
/* Reduced motion: keep opacity cues (they aid comprehension), strip
   spatial movement and decorative motion. Keyframes are overridden here
   because animations are applied via inline styles throughout. */
@media (prefers-reduced-motion: reduce) {
  .motion-safe-pop {
    animation-name: fade-in !important;
  }
  @keyframes fade-up {
    from { opacity: 0; transform: none; }
    to { opacity: 1; transform: none; }
  }
  @keyframes modal-pop {
    from { opacity: 0; transform: none; }
  }
  @keyframes scale-in {
    from { opacity: 0; transform: none; }
    to { opacity: 1; transform: none; }
  }
  @keyframes ring-pulse {
    0%, 100% { opacity: 0; transform: none; }
  }
  @keyframes leaf-burst {
    0%, 100% { opacity: 0; transform: none; }
  }
  @keyframes shimmer {
    0%, 100% { background-position: 0 0; }
  }
  /* fade-in, pulse-soft, draw-check intentionally kept: opacity/stroke
     only, no spatial motion. */
}
```

**Verify**: in Chrome DevTools → Rendering → "Emulate CSS
prefers-reduced-motion: reduce", complete a checklist item: the check draws
and content fades, but no particles fly and nothing slides or scales.
Turn emulation off: full motion returns.

## Test plan

No new automated tests (no component-test rig; motion is visual). The
verification gates above are the test. `pnpm test` must still pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -n "ease-out-strong" src/renderer/styles.css src/renderer/App.tsx src/renderer/components/ui/Modal.tsx` → ≥3 matches
- [ ] `grep -n "if (!open) return null" src/renderer/components/ui/Modal.tsx` → no matches
- [ ] `grep -c "@keyframes" src/renderer/styles.css` counts both the base
      set and the reduced-motion overrides (≥15)
- [ ] Manual: modal exits with animation; tab switches don't slide
- [ ] `git status` shows only the three in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `Modal.tsx` has grown focus-trap/portal logic since planning (the state
  machine must not break it — report instead).
- Keyframe overrides inside `@media` don't take effect in your dev check
  (would indicate the CSS build reorders blocks) — report; do not switch to
  a blanket `animation: none !important`.
- Rapid open/close of the modal leaves a stuck overlay after your fix
  attempt — report with the reproduction.

## Maintenance notes

- New animations should use `var(--ease-out-strong)` (entrances/exits) or
  `var(--ease-in-out-strong)` (on-screen movement), and any new keyframe
  with a `transform` needs a matching override in the reduced-motion block.
- Reviewer: scrutinize the Modal phase machine for the reopen-while-closing
  path and confirm `pointerEvents: "none"` is present on the closing card.
- Deferred: converting per-row list entrances (Today checklist stagger) to
  `@starting-style` transitions; keyframes are fine there since rows aren't
  re-triggered rapidly.
