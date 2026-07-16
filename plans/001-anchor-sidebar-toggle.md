# Plan 001: Anchor the sidebar toggle so it never floats in dead space

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0755cc8..HEAD -- src/renderer/App.tsx src/renderer/components/Sidebar.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI)
- **Planned at**: commit `0755cc8`, 2026-07-16

## Why this matters

The sidebar toggle is a `fixed` button hardcoded at `top-[14px] left-[78px]`.
That 78px offset exists to clear the macOS traffic lights in the **Electron**
build — but the app also ships as a **web app** (Vite `KOMOREBI_WEB=1` build,
used pinned to an iPhone home screen and in desktop browsers), where there are
no traffic lights. In web mode the button floats 78px from the left edge,
anchored to nothing: when the sidebar is open there is dead space to its left;
when the sidebar is collapsed it hangs mid-air over the page canvas. The owner
described it as "stranded and nowhere." Worse, web mode *starts* with the
sidebar collapsed (`useState(!isWebMode())`), so a desktop-browser user lands
on a page with no visible navigation at all — just the stranded chip.

After this plan: the toggle sits in the top-left corner in web mode (12px from
the edge, where a sidebar control is expected), keeps its traffic-light offset
only in Electron, the sidebar defaults to **open** on desktop-width web, and
the open/collapsed choice persists across reloads.

## Current state

- `src/renderer/App.tsx` — owns `sidebarOpen` state (line 22), renders
  `<SidebarToggle>` (lines 93, 99–126), and the ⌘B shortcut (lines 44–53).
- `src/renderer/components/Sidebar.tsx` — the 220px sidebar; collapses to
  width 0 with a 200ms width transition. Has a 52px top spacer (line 57)
  reserving room for traffic lights + the floating toggle.
- `src/renderer/lib/api.ts:195–197` — `isWebMode()` returns
  `import.meta.env.VITE_KOMOREBI_WEB === "true"`. Already imported in App.tsx.

Excerpt — `src/renderer/App.tsx:22`:

```tsx
const [sidebarOpen, setSidebarOpen] = useState(!isWebMode());
```

Excerpt — `src/renderer/App.tsx:99–116` (the toggle):

```tsx
function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <IconButton
      size="md"
      aria-label={open ? "Hide sidebar" : "Show sidebar"}
      title={open ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
      onClick={onToggle}
      className={cn(
        "no-drag fixed top-[14px] left-[78px] z-50 hidden h-[26px] w-[26px] p-0 md:inline-flex",
        ...
```

Conventions that apply:

- Styling is Tailwind utility classes over CSS variables (`var(--color-*)`)
  defined in `src/renderer/styles.css`. No hex/named colors.
- The `IconButton` primitive (`src/renderer/components/ui/IconButton.tsx`)
  is used for icon-only buttons; keep using it.
- The chip treatment for the collapsed state (border + `--color-panel` bg +
  `shadow-sm`) was added deliberately in commit `0755cc8` — keep it.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0, no errors   |
| Tests     | `pnpm test`      | all pass (suite is small; passes with no new tests) |
| Web dev   | `pnpm dev:web`   | Vite dev server URL printed |

## Scope

**In scope** (the only files you should modify):
- `src/renderer/App.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/renderer/components/Sidebar.tsx` — the 52px spacer and width
  transition are correct for both modes; leave them.
- `src/renderer/components/MobileNav.tsx` — phone nav is unrelated; the
  toggle is `hidden` below `md` and must stay that way.
- `src/renderer/lib/api.ts` — consume `isWebMode()`, don't change it.

## Git workflow

- Branch: `advisor/001-anchor-sidebar-toggle`
- Single commit; message style matches repo (`git log --oneline`): short
  imperative sentence, e.g. "Anchor sidebar toggle per platform"
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Position the toggle per platform

In `src/renderer/App.tsx`, change the `SidebarToggle` positioning so the
hardcoded `left-[78px]` applies only to Electron. At module level (or inside
the component — it's constant for the app's lifetime) compute:

```tsx
const TOGGLE_LEFT = isWebMode() ? "left-3" : "left-[78px]";
```

and replace `left-[78px]` in the `cn(...)` call with `TOGGLE_LEFT`. Note:
Tailwind requires full class names to exist in source — both `left-3` and
`left-[78px]` appear as complete literals above, so this is safe. Do not
build the class name by string concatenation of fragments.

Keep everything else about the button: `fixed top-[14px]`, `z-50`,
`hidden md:inline-flex`, the open/collapsed chip styling, the icon crossfade.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Default the sidebar open on desktop-width web, persist the choice

Replace `App.tsx:22` with a lazy initializer that (a) reads a persisted
value, (b) falls back to open:

```tsx
const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
  try {
    const saved = localStorage.getItem("komorebi.sidebarOpen");
    if (saved != null) return saved === "true";
  } catch {
    /* storage unavailable — fall through */
  }
  return true;
});

useEffect(() => {
  try {
    localStorage.setItem("komorebi.sidebarOpen", String(sidebarOpen));
  } catch {
    /* storage unavailable — non-fatal */
  }
}, [sidebarOpen]);
```

The `isWebMode()` special-case in the initializer is removed entirely — the
sidebar is desktop-only UI (`hidden` below `md`), so "default open" is right
for both Electron and web. On phones this state is invisible and harmless.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Sanity-check both visual states in the web build

Run `pnpm dev:web`, open the printed URL in a desktop-width browser window:

1. First load (clear the `komorebi.sidebarOpen` key in devtools → Application
   → Local Storage first): sidebar is **open**; toggle sits at the top-left
   **inside the sidebar** area, 12px from the window edge, borderless.
2. Click the toggle: sidebar animates closed (200ms); the button stays at the
   corner and gains the chip (border + shadow). It should now read as a
   deliberate corner control, not a floating stray.
3. Reload: collapsed state persists.
4. Press ⌘B twice: toggles both ways, no console errors.

**Verify**: all four observations hold; no horizontal scrollbar appears at
any point.

## Test plan

No new automated tests — this is presentation-only and the repo has no
component-test rig (only `src/lib/cn.test.ts` and
`src/main/checklist/selection.test.ts`, both non-UI). The manual check in
Step 3 is the test. `pnpm test` must still pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "left-\[78px\]" src/renderer/App.tsx` shows the class only
      inside the Electron branch of the platform conditional
- [ ] `grep -n "isWebMode()" src/renderer/App.tsx` no longer appears in the
      `useState` initializer for `sidebarOpen`
- [ ] `git status` shows only `src/renderer/App.tsx` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `App.tsx` no longer contains the `SidebarToggle` function or the
  `left-[78px]` literal (layout was reworked since planning).
- `isWebMode()` is gone from `src/renderer/lib/api.ts`.
- The Electron build turns out to render traffic lights somewhere other than
  the top-left (i.e. `left-[78px]` was NOT for traffic lights) — evidence
  would be a `titleBarStyle` other than `hiddenInset`/`hidden` in
  `src/main/window.ts`.

## Maintenance notes

- If a design pass later moves the toggle *inside* the sidebar header row
  (instead of a fixed overlay), delete the 52px spacer comment in
  `Sidebar.tsx:56` accordingly.
- Reviewer should confirm the Electron build still clears the traffic
  lights: `pnpm dev` and eyeball the top-left corner.
- Deferred: animating the toggle's `left` so it rides the sidebar seam.
  With the per-platform corner anchoring the button never needs to move,
  which is the calmer outcome — a control that stays put beats one that
  travels.
