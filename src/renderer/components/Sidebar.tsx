import { History, PanelLeftClose, Settings, Sunrise, Target } from "lucide-react";
import { cn } from "~/lib/cn";
import { IconButton } from "./ui/IconButton";

export type View = "today" | "history" | "goals" | "settings";

type NavItem = {
  id: View;
  label: string;
  Icon: typeof Sunrise;
};

/** Primary nav — Settings is rendered separately, pinned to the bottom. */
const PRIMARY: NavItem[] = [
  { id: "today", label: "Today", Icon: Sunrise },
  { id: "history", label: "History", Icon: History },
  { id: "goals", label: "Goals", Icon: Target }
];

const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  Icon: Settings
};

/** Open width in pixels — kept in JS so the transition animates a known value. */
const OPEN_WIDTH = 240;

type Props = {
  active: View;
  open: boolean;
  onSelect: (view: View) => void;
  onToggle: () => void;
};

/**
 * A quiet rail: who you're using, where you are, and nothing else. It's the
 * only place that names the current view, which is why no page repeats its
 * own name as a label above its title.
 *
 * Animates between fully-open and fully-collapsed (width 0) via a CSS width
 * transition. When collapsed, the toggle in App floats over the page.
 */
export function Sidebar({ active, open, onSelect, onToggle }: Props) {
  return (
    <aside
      aria-hidden={!open}
      style={{ width: open ? OPEN_WIDTH : 0 }}
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden md:flex",
        // In dark mode the page is true black; the border alone separates the
        // rail, exactly as it does on Vercel.
        "border-r border-alpha-400 bg-background-200 dark:bg-background-100",
        "transition-[width] duration-200 ease-out"
      )}
    >
      {/* Fixed-width inner shell so child layout doesn't reflow as width
          animates — children just get clipped by the parent's overflow. */}
      <div style={{ width: OPEN_WIDTH }} className="flex h-full shrink-0 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <Sunrise className="h-4 w-4 shrink-0 text-gray-1000" strokeWidth={1.75} aria-hidden />
          <span className="text-heading-14 text-gray-1000">Komorebi</span>
          <IconButton
            size="md"
            className="ml-auto"
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘B)"
            onClick={onToggle}
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>

        <nav className="flex flex-col gap-px px-2">
          {PRIMARY.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={item.id === active}
              onSelect={onSelect}
            />
          ))}
        </nav>

        {/* Settings is chrome, not content: pinned away from the primary three. */}
        <div className="mt-auto px-2 pb-3">
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "pressable-row flex h-8 items-center gap-2.5 rounded-md px-2 text-label-14",
        active
          ? "bg-alpha-200 font-medium text-gray-1000"
          : "text-gray-900 hover:bg-alpha-100 hover:text-gray-1000"
      )}
    >
      <item.Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {item.label}
    </button>
  );
}
