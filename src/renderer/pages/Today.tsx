import { Sunrise, ArrowRight } from "lucide-react";

export function Today() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="mx-auto max-w-2xl px-10 pt-24 pb-20">
      <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
        <Sunrise className="h-4 w-4" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
          today &middot; {today}
        </span>
      </div>

      <h1 className="mt-5 text-[32px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
        Your checklist <br />
        <span className="font-normal text-[var(--color-ink-2)]">arrives soon.</span>
      </h1>

      <p className="mt-7 max-w-md text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
        Once you connect a few integrations and add a goal, Claude will compose
        a small, specific set of actions for you each day — backed by real
        recipes, articles, calendar events, and more.
      </p>

      <div className="mt-12 flex items-center gap-2 border-t border-[var(--color-rule)] pt-6 text-[12.5px] text-[var(--color-ink-3)]">
        <span>Next step:</span>
        <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
          open Integrations <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </span>
        <span>and connect what you use.</span>
      </div>
    </div>
  );
}
