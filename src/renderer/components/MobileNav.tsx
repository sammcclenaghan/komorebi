import { History, Plug, Settings, Sunrise, Target } from "lucide-react";
import { cn } from "~/lib/cn";
import type { View } from "./Sidebar";

type NavItem = {
  id: View;
  label: string;
  Icon: typeof Sunrise;
};

const ITEMS: NavItem[] = [
  { id: "today", label: "Today", Icon: Sunrise },
  { id: "history", label: "History", Icon: History },
  { id: "goals", label: "Goals", Icon: Target },
  { id: "integrations", label: "Integrations", Icon: Plug },
  { id: "settings", label: "Settings", Icon: Settings }
];

type Props = {
  active: View;
  onSelect: (view: View) => void;
};

/** Bottom tab bar for phones — hidden on md+ where the sidebar is used. */
export function MobileNav({ active, onSelect }: Props) {
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "border-t border-[var(--color-rule)] bg-[var(--color-panel)]/95 backdrop-blur-md",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      )}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "pressable flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-2xs",
                isActive
                  ? "text-[var(--color-accent-strong)]"
                  : "text-[var(--color-ink-3)] active:text-[var(--color-ink)]"
              )}
            >
              <item.Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              <span className="truncate leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
