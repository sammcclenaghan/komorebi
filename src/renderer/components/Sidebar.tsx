import { History, Plug, Settings, Sunrise, Target } from "lucide-react";
import { cn } from "~/lib/cn";

export type View = "today" | "history" | "goals" | "integrations" | "settings";

type NavItem = {
  id: View;
  label: string;
  Icon: typeof Sunrise;
};

/** Primary nav — Settings is rendered separately, pinned to the bottom. */
const PRIMARY: NavItem[] = [
  { id: "today", label: "Today", Icon: Sunrise },
  { id: "history", label: "History", Icon: History },
  { id: "goals", label: "Goals", Icon: Target },
  { id: "integrations", label: "Integrations", Icon: Plug }
];

const SETTINGS_ITEM: NavItem = { id: "settings", label: "Settings", Icon: Settings };

/** Open width in pixels — kept in JS so the transition animates a known value. */
const OPEN_WIDTH = 220;

type Props = {
  active: View;
  open: boolean;
  onSelect: (view: View) => void;
};

/**
 * Animates between fully-open and fully-collapsed (width 0) via a CSS
 * width transition. When collapsed, the toggle button (rendered in App)
 * floats over the main viewport so the user can pop the sidebar back open.
 */
export function Sidebar({ active, open, onSelect }: Props) {
  return (
    <aside
      aria-hidden={!open}
      style={{ width: open ? OPEN_WIDTH : 0 }}
      className={cn(
        "drag-region hidden shrink-0 flex-col overflow-hidden md:flex",
        "transition-[width] duration-200 ease-out"
      )}
    >
      {/* Fixed-width inner shell so child layout doesn't reflow as width
          animates — children just get clipped by the parent's overflow. */}
      <div
        style={{ width: OPEN_WIDTH }}
        className="flex h-full shrink-0 flex-col"
      >
        {/* Spacer for macOS traffic lights + the floating toggle button. */}
        <div className="h-[52px]" />

        <nav className="no-drag flex flex-col gap-0.5 px-2">
          {PRIMARY.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={item.id === active}
              onSelect={onSelect}
            />
          ))}
        </nav>

        {/* Pinned to bottom-left, separated from primary nav by flex spacer. */}
        <div className="no-drag mt-auto px-2 pb-3">
          <NavButton
            item={SETTINGS_ITEM}
            active={active === "settings"}
            onSelect={onSelect}
          />
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  item,
  active,
  onSelect
}: {
  item: NavItem;
  active: boolean;
  onSelect: (view: View) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      title={item.label}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors",
        active
          ? "bg-[var(--color-panel-2)] text-[var(--color-ink)]"
          : "text-[var(--color-ink-2)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-ink)]"
      )}
    >
      <item.Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.5} />
      <span className="leading-none">{item.label}</span>
    </button>
  );
}
