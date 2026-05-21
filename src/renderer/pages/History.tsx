import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, History as HistoryIcon, SkipForward, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "~/lib/cn";
import type { HistoryDay } from "~/main/checklist/orchestrator";
import type { Goal, Reflection, Suggestion } from "~/shared/types";

type Props = {
  onOpenSuggestion: (id: string) => void;
};

export function History({ onOpenSuggestion }: Props) {
  const historyQuery = useQuery({
    queryKey: ["history"],
    queryFn: () => window.komorebi.history.list(30)
  });

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list(),
    staleTime: 60_000
  });

  const goalsById = new Map((goalsQuery.data ?? []).map((g) => [g.id, g]));
  const days = historyQuery.data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-10 pt-16 pb-20">
      <header>
        <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
          <HistoryIcon className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            history
          </span>
        </div>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
          What you've been <span className="font-normal text-[var(--color-ink-2)]">working on.</span>
        </h1>
        <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          Past days at a glance — what Claude composed, what you finished, and
          the notes you wrote afterward.
        </p>
      </header>

      <div className="mt-12">
        {historyQuery.isLoading ? (
          <LoadingState />
        ) : days.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-12">
            {days.map((day, dayIdx) => (
              <DayBlock
                key={day.date}
                day={day}
                goalsById={goalsById}
                onOpenSuggestion={onOpenSuggestion}
                style={{
                  animation: `fade-up 420ms ${Math.min(dayIdx, 6) * 50}ms backwards ease-out`
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayBlock({
  day,
  goalsById,
  onOpenSuggestion,
  style
}: {
  day: HistoryDay;
  goalsById: Map<string, Goal>;
  onOpenSuggestion: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const doneCount = day.items.filter((s) => s.status === "done").length;
  const nonSkipped = day.items.filter((s) => s.status !== "skipped");

  return (
    <section style={style}>
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[16px] font-semibold tracking-tight text-[var(--color-ink)]">
            {formatLongDate(day.date)}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            {formatRelativeDay(day.date)}
          </span>
        </div>
        {nonSkipped.length > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-3)]">
            <span className="text-[var(--color-ink)]">{doneCount}</span>
            <span className="opacity-60"> / </span>
            <span>{nonSkipped.length}</span>
          </span>
        )}
      </header>

      <ul className="mt-3 space-y-2">
        {day.items.map((item) => (
          <li key={item.id}>
            <HistoryRow
              item={item}
              goal={goalsById.get(item.goalId)}
              reflections={day.reflectionsByItem[item.id] ?? []}
              onOpen={() => onOpenSuggestion(item.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryRow({
  item,
  goal,
  reflections,
  onOpen
}: {
  item: Suggestion;
  goal: Goal | undefined;
  reflections: Reflection[];
  onOpen: () => void;
}) {
  const isDone = item.status === "done";
  const isSkipped = item.status === "skipped";

  return (
    <article
      className={cn(
        "group rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] transition-colors",
        "hover:border-[var(--color-rule-2)]",
        isSkipped && "opacity-55"
      )}
    >
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-4 px-4 py-3.5 text-left"
      >
        <StatusDot status={item.status} />

        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-[14.5px] font-medium leading-snug text-[var(--color-ink)]",
              (isDone || isSkipped) && "line-through decoration-[var(--color-ink-3)] decoration-[1px]"
            )}
          >
            {item.title}
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-2)] line-clamp-1">
            {item.summary}
          </p>
          <div className="mt-2 flex items-center gap-2.5 text-[10.5px] text-[var(--color-ink-3)]">
            {goal && (
              <span className="font-mono uppercase tracking-[0.14em]">{goal.title}</span>
            )}
            {item.estimatedMinutes != null && (
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                {item.estimatedMinutes}m
              </span>
            )}
            {isSkipped && <span className="font-mono uppercase tracking-[0.14em]">skipped</span>}
          </div>
        </div>

        {item.rating === "up" && (
          <ThumbsUp
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-strong)]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        )}
        {item.rating === "down" && (
          <ThumbsDown
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        )}

        <ChevronRight
          className="mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-60"
          strokeWidth={1.5}
        />
      </button>

      {reflections.length > 0 && (
        <div className="border-t border-[var(--color-rule)] px-4 py-3">
          <div className="space-y-1.5">
            {reflections.map((r) => (
              <p
                key={r.id}
                className="border-l-2 border-[var(--color-rule-2)] pl-3 text-[12.5px] leading-snug italic text-[var(--color-ink-2)]"
              >
                {r.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function StatusDot({ status }: { status: Suggestion["status"] }) {
  if (status === "done") {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-canvas)]">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--color-rule-2)] bg-[var(--color-panel)] text-[var(--color-ink-3)]">
        <SkipForward className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-[var(--color-rule-2)] bg-[var(--color-canvas)]" />
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ animation: `fade-up 400ms ${i * 60}ms backwards ease-out` }}>
          <div className="h-4 w-32 rounded-md bg-[var(--color-panel)]" />
          <div className="mt-3 space-y-2">
            <div className="h-[74px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]" />
            <div className="h-[74px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-12 max-w-sm text-center">
      <h3 className="text-[20px] font-semibold tracking-tight text-[var(--color-ink)]">
        Nothing yet.
      </h3>
      <p className="mt-2 text-[13px] text-[var(--color-ink-2)]">
        Past days will show up here. Come back tomorrow.
      </p>
    </div>
  );
}

function formatLongDate(yyyymmdd: string): string {
  // Parse YYYY-MM-DD as a local date (avoid Date string parsing timezone gotchas).
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatRelativeDay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const target = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
