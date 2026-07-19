import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Flame,
  Loader2,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
} from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import { ChecklistRow } from "../components/ChecklistRow";
import { GeneratingRow } from "../components/GeneratingRow";
import { AllCaughtUp } from "../components/AllCaughtUp";
import { Button } from "../components/ui/Button";
import { Tooltip } from "@base-ui/react/tooltip";
import type { Goal, Suggestion, WeatherSummary } from "~/shared/schema";
import type {
  ChecklistProgress,
  InFlightGoal,
} from "../lib/use-checklist-progress";

function locationFromTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = tz.split("/");
    const last = parts[parts.length - 1] ?? "";
    return last.replace(/_/g, " ");
  } catch {
    return "";
  }
}

function WeatherIcon({
  summary,
}: {
  summary: WeatherSummary | null | undefined;
}) {
  if (!summary) {
    return <Sunrise className="h-4 w-4" strokeWidth={1.5} />;
  }
  const props = { className: "h-4 w-4", strokeWidth: 1.5 };
  switch (summary.condition) {
    case "clear":
      return summary.isNight ? <Moon {...props} /> : <Sun {...props} />;
    case "clouds":
      return <Cloud {...props} />;
    case "rain":
      return <CloudRain {...props} />;
    case "drizzle":
      return <CloudDrizzle {...props} />;
    case "snow":
      return <CloudSnow {...props} />;
    case "thunderstorm":
      return <CloudLightning {...props} />;
    case "mist":
      return <CloudFog {...props} />;
    default:
      return <Sunrise {...props} />;
  }
}

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Card styling for the weather tooltip popup (Base UI applies the state attrs). */
const weatherPopupClasses = cn(
  "w-[230px] rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)] p-3",
  "shadow-[0_18px_36px_-18px_oklch(20%_0.01_60/0.22),0_4px_10px_-4px_oklch(20%_0.01_60/0.10)]",
  "transition-[opacity,transform] duration-150 ease-out",
  "data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-1",
  "data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-1"
);

function WeatherTooltipBody({ summary }: { summary: WeatherSummary }) {
  const d = summary.daily;
  return (
    <>
      <div className="font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
        {summary.resolvedName}
        {summary.isNight && <span className="ml-1.5 opacity-70">· night</span>}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-base font-medium text-[var(--color-ink)]">
          {titleCase(summary.description)}
        </div>
        <div className="text-xl font-semibold tabular-nums leading-none text-[var(--color-ink)]">
          {summary.temperatureC}°
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-rule)] pt-2">
        <div className="font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
          today
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-sm text-[var(--color-ink-2)]">
          <span>{titleCase(d.description)}</span>
          <span className="tabular-nums text-[var(--color-ink)]">
            {d.tempMaxC}° / {d.tempMinC}°
          </span>
        </div>
        {d.precipitationProbabilityPct >= 30 && (
          <div className="mt-1 text-xs tabular-nums text-[var(--color-ink-3)]">
            {d.precipitationProbabilityPct}% chance of precipitation
          </div>
        )}
      </div>
    </>
  );
}

type Props = {
  onOpenSuggestion: (id: string) => void;
  /** Owned by App so it survives page navigation mid-generation. */
  progress: ChecklistProgress;
};

export function Today({ onOpenSuggestion, progress }: Props) {
  const queryClient = useQueryClient();
  const [showAddGoal, setShowAddGoal] = useState(false);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list(),
  });

  const checklistQuery = useQuery({
    queryKey: ["checklist", "today"],
    queryFn: () => window.komorebi.checklist.today(),
  });

  const generate = useMutation({
    mutationFn: () => window.komorebi.checklist.generate(),
    onSuccess: (data) => {
      queryClient.setQueryData(["checklist", "today"], data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    },
  });

  // Per-goal recovery: a failed goal retries alone instead of re-running the
  // whole day. The progress events drive the placeholder back to "composing".
  const retryGoal = useMutation({
    mutationFn: (goalId: string) => window.komorebi.checklist.retryGoal(goalId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    },
  });

  const { inFlight, active } = progress;

  const location = useMemo(() => locationFromTimezone(), []);
  const weatherQuery = useQuery({
    queryKey: ["weather", location],
    queryFn: () => window.komorebi.weather.current(location),
    enabled: location.length > 0,
    staleTime: 25 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const statsQuery = useQuery({
    queryKey: ["checklist", "stats"],
    queryFn: () => window.komorebi.checklist.stats(),
  });

  const goals = goalsQuery.data ?? [];
  const activeGoals = goals.filter((g) => g.status === "active");
  const checklist = checklistQuery.data;
  const items = checklist?.items ?? [];
  const streak = statsQuery.data?.currentStreak ?? 0;

  const goalsById = useMemo(() => {
    const map = new Map<string, Goal>();
    for (const g of goals) map.set(g.id, g);
    return map;
  }, [goals]);

  // Hide placeholders for goals that already have a real item in the checklist
  // (the IPC goal-done fires invalidation, so the real item appears).
  const itemGoalIds = useMemo(
    () => new Set(items.map((s) => s.goalId)),
    [items],
  );
  const visiblePlaceholders = useMemo(
    () => [...inFlight.values()].filter((g) => !itemGoalIds.has(g.id)),
    [inFlight, itemGoalIds],
  );

  // Active goals that don't have a non-skipped suggestion today are the ones
  // "Top up" would compose for. When this is zero, the button hides.
  const coveredGoalIds = useMemo(
    () =>
      new Set(items.filter((s) => s.status !== "skipped").map((s) => s.goalId)),
    [items],
  );
  const topUpCount = activeGoals.filter((g) => {
    if (coveredGoalIds.has(g.id)) return false;
    // A goal whose generation failed is retryable, not in flight.
    const pending = inFlight.get(g.id);
    return !pending || pending.state === "error";
  }).length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const isLoading = goalsQuery.isLoading || checklistQuery.isLoading;
  const noGoals = activeGoals.length === 0;
  const showChecklist =
    items.length > 0 || visiblePlaceholders.length > 0 || active;

  // Auto-start generation when Today opens and there's nothing for today yet.
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (isLoading) return;
    if (noGoals) return;
    if (items.length > 0) return;
    if (active || generate.isPending) return;
    autoFiredRef.current = true;
    generate.mutate();
  }, [isLoading, noGoals, items.length, active, generate]);

  return (
    <>
      <div className="page-shell">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
            {weatherQuery.data ? (
              <Tooltip.Provider delay={150} closeDelay={100}>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    render={<span className="inline-flex cursor-default" />}
                  >
                    <WeatherIcon summary={weatherQuery.data} />
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner side="bottom" align="start" sideOffset={8} className="z-30">
                      <Tooltip.Popup className={weatherPopupClasses}>
                        <WeatherTooltipBody summary={weatherQuery.data} />
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            ) : (
              <WeatherIcon summary={weatherQuery.data} />
            )}
            <span className="font-mono text-2xs uppercase tracking-[0.22em]">
              {today}
            </span>
          </div>

          {streak >= 2 && (
            <div
              className="flex items-center gap-1.5 text-[var(--color-ink-3)]"
              title={`${streak} consecutive days with at least one task completed`}
            >
              <Flame className="h-3.5 w-3.5 text-[var(--color-accent-strong)]" strokeWidth={1.75} />
              <span className="font-mono text-2xs uppercase tracking-[0.22em]">
                {streak}-day streak
              </span>
            </div>
          )}
        </header>

        {checklist?.brief && !isLoading && !noGoals && (
          <CoachBrief text={checklist.brief} />
        )}

        {isLoading ? (
          <LoadingState />
        ) : noGoals ? (
          <NoGoalsState onAdd={() => setShowAddGoal(true)} />
        ) : showChecklist ? (
          <ChecklistView
            items={items}
            placeholders={visiblePlaceholders}
            goalsById={goalsById}
            onOpenSuggestion={onOpenSuggestion}
            onRefresh={() => generate.mutate()}
            onRetryGoal={(goalId) => retryGoal.mutate(goalId)}
            generating={generate.isPending || active}
            topUpCount={topUpCount}
            allDone={
              items.length > 0 &&
              visiblePlaceholders.length === 0 &&
              items.every(
                (s) => s.status === "done" || s.status === "skipped",
              ) &&
              items.some((s) => s.status === "done")
            }
          />
        ) : (
          <NoChecklistYet
            goals={activeGoals}
            onGenerate={() => generate.mutate()}
            generating={generate.isPending}
            error={generate.error as Error | null}
            onAddGoal={() => setShowAddGoal(true)}
          />
        )}
      </div>

      <GoalModal open={showAddGoal} onClose={() => setShowAddGoal(false)} />
    </>
  );
}

/** The morning coach note — composed alongside the day's checklist. */
function CoachBrief({ text }: { text: string }) {
  return (
    <aside
      className={cn(
        "mt-8 flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent-tint)]/60 px-4 py-3.5"
      )}
      style={{ animation: "fade-up 320ms backwards ease-out" }}
    >
      <Sunrise
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-strong)]"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-accent-strong)]/80">
          this morning
        </div>
        <p className="mt-1 text-base leading-relaxed text-[var(--color-ink)]">{text}</p>
      </div>
    </aside>
  );
}

function LoadingState() {
  return (
    <div className="mt-12 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[78px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]"
          style={{ animation: `fade-up 400ms ${i * 60}ms backwards ease-out` }}
        />
      ))}
    </div>
  );
}

function NoGoalsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10">
      <h1 className="text-4xl font-semibold text-[var(--color-ink)]">
        Start with one goal.
      </h1>
      <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--color-ink-2)]">
        Tell Komorebi what you're working toward - anything from "lose 10 lbs"
        to "become a better dev." It'll compose a small, specific checklist for
        you each day.
      </p>

      <Button size="lg" className="mt-7" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Add a goal
      </Button>
    </div>
  );
}

function NoChecklistYet({
  goals,
  onGenerate,
  generating,
  error,
  onAddGoal,
}: {
  goals: Goal[];
  onGenerate: () => void;
  generating: boolean;
  error: Error | null;
  onAddGoal: () => void;
}) {
  return (
    <div className="mt-10">
      <h1 className="text-4xl font-semibold text-[var(--color-ink)]">
        Ready when you are.
      </h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--color-ink-2)]">
        {goals.length === 1
          ? "Komorebi will compose today's action for your goal."
          : `Komorebi will compose today's action for each of your ${goals.length} active goals.`}{" "}
        Takes roughly 30 seconds per goal.
      </p>

      <ul className="mt-6 space-y-1.5">
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-2 text-base text-[var(--color-ink-2)]"
          >
            <span className="h-1 w-1 rounded-full bg-[var(--color-ink-3)]" />
            {g.title}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex items-center gap-2">
        <Button size="lg" onClick={onGenerate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Composing your day…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Generate today's checklist
            </>
          )}
        </Button>
        <Button variant="secondary" size="lg" onClick={onAddGoal}>
          <Plus className="h-3 w-3" strokeWidth={2} />
          Add another goal
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink-2)]">
          {error.message}
        </div>
      )}
    </div>
  );
}

function ChecklistView({
  items,
  placeholders,
  goalsById,
  onOpenSuggestion,
  onRefresh,
  onRetryGoal,
  generating,
  topUpCount,
  allDone,
}: {
  items: Suggestion[];
  placeholders: InFlightGoal[];
  goalsById: Map<string, Goal>;
  onOpenSuggestion: (id: string) => void;
  onRefresh: () => void;
  onRetryGoal: (goalId: string) => void;
  generating: boolean;
  topUpCount: number;
  allDone: boolean;
}) {
  return (
    <div className="mt-12">
      <ul className="space-y-2.5">
        {items.map((s, idx) => (
          <li
            key={s.id}
            style={{
              animation: `fade-up 320ms ${Math.min(idx, 6) * 40}ms backwards ease-out`,
            }}
          >
            <ChecklistRow
              suggestion={s}
              goal={goalsById.get(s.goalId)}
              onOpen={() => onOpenSuggestion(s.id)}
            />
          </li>
        ))}
        {placeholders.map((p, idx) => (
          <li
            key={`placeholder-${p.id}`}
            style={{
              animation: `fade-up 320ms ${Math.min(idx + items.length, 6) * 40}ms backwards ease-out`,
            }}
          >
            <GeneratingRow
              goalTitle={p.title}
              status={p.status}
              error={
                p.state === "error"
                  ? p.error?.trim() || "Something went wrong."
                  : undefined
              }
              onRetry={p.state === "error" ? () => onRetryGoal(p.id) : undefined}
            />
          </li>
        ))}
      </ul>

      {allDone && <AllCaughtUp />}

      {topUpCount > 0 && (
        <div className="mt-8 flex items-center justify-end border-t border-[var(--color-rule)] pt-4 text-sm text-[var(--color-ink-3)]">
          <button
            onClick={onRefresh}
            disabled={generating}
            className="pressable inline-flex items-center gap-1.5 hover:text-[var(--color-ink)] active:text-[var(--color-ink)] disabled:opacity-50"
            title={`Compose for ${topUpCount} uncovered goal${topUpCount === 1 ? "" : "s"}`}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" strokeWidth={2} />
            )}
            {generating
              ? "Composing…"
              : `+ ${topUpCount} more ${topUpCount === 1 ? "goal" : "goals"}`}
          </button>
        </div>
      )}
    </div>
  );
}
