import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

type Props = {
  goalTitle: string;
  /** Optional explicit status string. If absent the row cycles through generic phrases. */
  status?: string;
  /** When set, the row renders as a failed generation instead of a shimmer. */
  error?: string;
  onRetry?: () => void;
};

const ROTATING_STATUSES = [
  "Gathering context…",
  "Searching the web…",
  "Composing today's action…",
  "Polishing the details…"
];

export function GeneratingRow({ goalTitle, status, error, onRetry }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status || error) return;
    const id = setInterval(() => setTick((t) => t + 1), 2400);
    return () => clearInterval(id);
  }, [status, error]);

  if (error !== undefined) {
    return (
      <article
        className="relative flex items-start gap-4 rounded-xl border border-[var(--color-rule-2)] bg-[var(--color-panel)] px-4 py-3.5"
        aria-live="polite"
      >
        <span
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[var(--color-ink-3)]"
          aria-hidden
        >
          <CircleAlert className="h-[16px] w-[16px]" strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            {goalTitle}
          </div>
          <h3 className="mt-1 text-[14px] font-medium leading-snug text-[var(--color-ink)]">
            Couldn't compose today's action
          </h3>
          <p className="mt-0.5 break-words text-[12px] leading-relaxed text-[var(--color-ink-3)]">
            {error}
          </p>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="pressable mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-rule)] px-2.5 py-1.5 text-[12px] text-[var(--color-ink-2)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)] active:border-[var(--color-rule-2)] active:text-[var(--color-ink)]"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2} />
            Try again
          </button>
        )}
      </article>
    );
  }

  const phrase = status ?? ROTATING_STATUSES[tick % ROTATING_STATUSES.length];

  return (
    <article
      className="relative flex items-start gap-4 overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5"
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
