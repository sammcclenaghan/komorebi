import { useEffect, useState } from "react";
import { cn } from "~/lib/cn";

type Props = {
  goalTitle: string;
  /** Optional explicit status string. If absent the row cycles through generic phrases. */
  status?: string;
};

const ROTATING_STATUSES = [
  "Gathering context…",
  "Searching the web…",
  "Composing today's action…",
  "Polishing the details…"
];

export function GeneratingRow({ goalTitle, status }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status) return;
    const id = setInterval(() => setTick((t) => t + 1), 2400);
    return () => clearInterval(id);
  }, [status]);

  const phrase = status ?? ROTATING_STATUSES[tick % ROTATING_STATUSES.length];

  return (
    <article
      className={cn(
        "relative flex items-start gap-4 overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5",
        "transition-all"
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-panel-2)]/40 to-transparent"
        style={{ backgroundSize: "200% 100%", animation: "shimmer 2.4s infinite linear" }}
      />

      {/* placeholder checkbox bubble that subtly pulses */}
      <span
        className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--color-rule-2)] bg-[var(--color-canvas)]"
        aria-hidden
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-[pulse-soft_1.6s_ease-in-out_infinite]" />
      </span>

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            {goalTitle}
          </span>
        </div>
        <h3
          key={phrase}
          className="mt-1 text-[14px] font-medium leading-snug text-[var(--color-ink-2)]"
          style={{ animation: "fade-up 280ms ease-out" }}
        >
          {phrase}
        </h3>
        <div className="mt-2 flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-[var(--color-ink-3)] animate-[pulse-soft_1.6s_ease-in-out_infinite]" />
          <span
            className="h-1 w-1 rounded-full bg-[var(--color-ink-3)] animate-[pulse-soft_1.6s_ease-in-out_infinite]"
            style={{ animationDelay: "0.2s" }}
          />
          <span
            className="h-1 w-1 rounded-full bg-[var(--color-ink-3)] animate-[pulse-soft_1.6s_ease-in-out_infinite]"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      </div>
    </article>
  );
}
