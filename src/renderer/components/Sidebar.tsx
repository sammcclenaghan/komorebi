import { History, Plug, Sunrise, Target } from "lucide-react";
import { cn } from "~/lib/cn";

export type View = "today" | "history" | "goals" | "integrations";

type NavItem = {
  id: View;
  label: string;
  Icon: typeof Sunrise;
};

const items: NavItem[] = [
  { id: "today", label: "Today", Icon: Sunrise },
  { id: "history", label: "History", Icon: History },
  { id: "goals", label: "Goals", Icon: Target },
  { id: "integrations", label: "Integrations", Icon: Plug }
];

type Props = {
  active: View;
  onSelect: (view: View) => void;
};

/**
 * Auto-collapses to icon-only when the window is narrower than 800px
 * (e.g. when the user snaps Komorebi to half a 1440-wide screen).
 * Above that, labels show. Native tooltip on hover when collapsed.
 */
export function Sidebar({ active, onSelect }: Props) {
  return (
    <aside
      className={cn(
        "drag-region flex w-[60px] shrink-0 flex-col min-[800px]:w-[192px]",
        "border-r border-[var(--color-rule)] bg-[var(--color-panel)]",
        "transition-[width] duration-150"
      )}
    >
      {/* Spacer for macOS traffic lights */}
      <div className="h-[52px]" />

      <nav className="no-drag flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.label}
              className={cn(
                "group flex items-center justify-center gap-3 rounded-md py-2 text-[14px] transition-colors",
                "px-0 min-[800px]:justify-start min-[800px]:px-3",
                isActive
                  ? "bg-[var(--color-panel-2)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-2)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-ink)]"
              )}
            >
              <item.Icon
                className="h-[17px] w-[17px] shrink-0"
                strokeWidth={1.5}
              />
              <span className="hidden leading-none min-[800px]:inline">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
