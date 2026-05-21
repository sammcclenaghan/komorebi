import { Sunrise, Target, Plug, Settings } from "lucide-react";
import { cn } from "~/lib/cn";

export type View = "today" | "goals" | "integrations";

type NavItem = {
  id: View;
  label: string;
  Icon: typeof Sunrise;
};

const items: NavItem[] = [
  { id: "today", label: "Today", Icon: Sunrise },
  { id: "goals", label: "Goals", Icon: Target },
  { id: "integrations", label: "Integrations", Icon: Plug }
];

type Props = {
  active: View;
  onSelect: (view: View) => void;
  connectedCount: number;
  goalCount: number;
};

export function Sidebar({ active, onSelect, connectedCount, goalCount }: Props) {
  return (
    <aside
      className={cn(
        "drag-region flex w-[228px] shrink-0 flex-col",
        "border-r border-[var(--color-rule)] bg-[var(--color-panel)]"
      )}
    >
      {/* Spacer for macOS traffic lights */}
      <div className="h-[42px]" />

      <div className="px-5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
            Goalpath
          </span>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
          />
        </div>
        <div className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
          quiet daily focus
        </div>
      </div>

      <nav className="no-drag mt-9 flex flex-col gap-px px-2">
        {items.map((item) => {
          const isActive = item.id === active;
          const badge =
            item.id === "integrations" && connectedCount > 0
              ? connectedCount
              : item.id === "goals" && goalCount > 0
                ? goalCount
                : null;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-[7px] text-[13px] transition-colors",
                isActive
                  ? "bg-[var(--color-panel-2)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-2)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-ink)]"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-[-2px] top-1/2 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--color-accent)] transition-all",
                  isActive ? "h-4 opacity-100" : "h-3 opacity-0 group-hover:opacity-30"
                )}
              />
              <item.Icon className="h-[15px] w-[15px]" strokeWidth={1.5} />
              <span className="leading-none">{item.label}</span>
              {badge != null && (
                <span
                  className={cn(
                    "ml-auto font-mono text-[10px] tracking-wide tabular-nums",
                    isActive ? "text-[var(--color-accent)]" : "text-[var(--color-ink-3)]"
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="no-drag mt-auto px-5 py-5">
        <div className="flex items-center justify-between text-[10.5px] text-[var(--color-ink-3)]">
          <span className="font-mono tracking-wider">v0.1.0</span>
          <button
            className="transition-colors hover:text-[var(--color-ink)]"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
