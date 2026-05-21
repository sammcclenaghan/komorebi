import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Loader2,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Sunrise
} from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import { ChecklistRow } from "../components/ChecklistRow";
import { GeneratingRow } from "../components/GeneratingRow";
import { AllCaughtUp } from "../components/AllCaughtUp";
import type { Goal, Suggestion } from "~/shared/types";
import type { WeatherSummary } from "~/main/weather/service";
import type { GenerationProgress } from "~/main/checklist/orchestrator";

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

function WeatherIcon({ summary }: { summary: WeatherSummary | null | undefined }) {
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

function WeatherTooltip({ summary }: { summary: WeatherSummary }) {
  const d = summary.daily;
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute left-0 top-full z-30 mt-2 w-[230px] origin-top-left",
        "opacity-0 -translate-y-1 transition-all duration-150 ease-out",
        "group-hover:opacity-100 group-hover:translate-y-0",
        "rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)] p-3",
        "shadow-[0_18px_36px_-18px_oklch(20%_0.01_60/0.22),0_4px_10px_-4px_oklch(20%_0.01_60/0.10)]"
      )}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
        {summary.resolvedName}
        {summary.isNight && <span className="ml-1.5 opacity-70">· night</span>}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-medium text-[var(--color-ink)]">
          {titleCase(summary.description)}
        </div>
        <div className="text-[18px] font-semibold tabular-nums leading-none text-[var(--color-ink)]">
          {summary.temperatureC}°
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-rule)] pt-2">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
          today
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px] text-[var(--color-ink-2)]">
          <span>{titleCase(d.description)}</span>
          <span className="tabular-nums text-[var(--color-ink)]">
            {d.tempMaxC}° / {d.tempMinC}°
          </span>
        </div>
        {d.precipitationProbabilityPct >= 30 && (
          <div className="mt-1 text-[11px] tabular-nums text-[var(--color-ink-3)]">
            {d.precipitationProbabilityPct}% chance of precipitation
          </div>
        )}
      </div>
    </div>
  );
}

type InFlightGoal = { id: string; title: string; state: "pending" | "in-progress" | "error"; error?: string };

function useChecklistProgress() {
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState<Map<string, InFlightGoal>>(new Map());
  const [active, setActive] = useState(false);

  useEffect(() => {
    const unsubscribe = window.komorebi.checklist.onProgress((event: GenerationProgress) => {
      switch (event.phase) {
        case "start": {
          setActive(true);
          const fresh = new Map<string, InFlightGoal>();
          for (const g of event.goals) {
            fresh.set(g.id, { id: g.id, title: g.title, state: "pending" });
          }
          setInFlight(fresh);
          break;
        }
        case "goal-start": {
          setInFlight((prev) => {
            const next = new Map(prev);
            const cur = next.get(event.goalId);
            if (cur) next.set(event.goalId, { ...cur, state: "in-progress" });
            return next;
          });
          break;
        }
        case "goal-done": {
          setInFlight((prev) => {
            const next = new Map(prev);
            next.delete(event.goalId);
            return next;
          });
          void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
          break;
        }
        case "goal-error": {
          setInFlight((prev) => {
            const next = new Map(prev);
            const cur = next.get(event.goalId);
            if (cur) {
              next.set(event.goalId, { ...cur, state: "error", error: event.message });
            }
            return next;
          });
          break;
        }
        case "done": {
          setActive(false);
          // Clear after a beat so any straggler placeholders fade out cleanly.
          setTimeout(() => setInFlight(new Map()), 400);
          void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
          break;
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);

  return { inFlight, active };
}

type Props = {
  onOpenSuggestion: (id: string) => void;
};

export function Today({ onOpenSuggestion }: Props) {
  const queryClient = useQueryClient();
  const [showAddGoal, setShowAddGoal] = useState(false);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list()
  });

  const checklistQuery = useQuery({
    queryKey: ["checklist", "today"],
    queryFn: () => window.komorebi.checklist.today()
  });

  const generate = useMutation({
    mutationFn: () => window.komorebi.checklist.generate(),
    onSuccess: (data) => {
      queryClient.setQueryData(["checklist", "today"], data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  const { inFlight, active } = useChecklistProgress();

  const location = useMemo(() => locationFromTimezone(), []);
  const weatherQuery = useQuery({
    queryKey: ["weather", location],
    queryFn: () => window.komorebi.weather.current(location),
    enabled: location.length > 0,
    staleTime: 25 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const goals = goalsQuery.data ?? [];
  const activeGoals = goals.filter((g) => g.status === "active");
  const checklist = checklistQuery.data;
  const items = checklist?.items ?? [];

  const goalsById = useMemo(() => {
    const map = new Map<string, Goal>();
    for (const g of goals) map.set(g.id, g);
    return map;
  }, [goals]);

  // Hide placeholders for goals that already have a real item in the checklist
  // (the IPC goal-done fires invalidation, so the real item appears).
  const itemGoalIds = useMemo(() => new Set(items.map((s) => s.goalId)), [items]);
  const visiblePlaceholders = useMemo(
    () => [...inFlight.values()].filter((g) => !itemGoalIds.has(g.id)),
    [inFlight, itemGoalIds]
  );

  // Active goals that don't have a non-skipped suggestion today are the ones
  // "Top up" would compose for. When this is zero, the button hides.
  const coveredGoalIds = useMemo(
    () => new Set(items.filter((s) => s.status !== "skipped").map((s) => s.goalId)),
    [items]
  );
  const topUpCount = activeGoals.filter(
    (g) => !coveredGoalIds.has(g.id) && !inFlight.has(g.id)
  ).length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  const isLoading = goalsQuery.isLoading || checklistQuery.isLoading;
  const noGoals = activeGoals.length === 0;
  const showChecklist = items.length > 0 || visiblePlaceholders.length > 0 || active;

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
      <div className="mx-auto max-w-2xl px-10 pt-16 pb-20">
        <header className="flex items-center justify-between">
          <div className="group relative flex items-center gap-3 text-[var(--color-ink-3)]">
            <div className="relative">
              <WeatherIcon summary={weatherQuery.data} />
              {weatherQuery.data && <WeatherTooltip summary={weatherQuery.data} />}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              {today}
            </span>
          </div>
        </header>

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
            generating={generate.isPending || active}
            topUpCount={topUpCount}
            allDone={
              items.length > 0 &&
              visiblePlaceholders.length === 0 &&
              items.every((s) => s.status === "done" || s.status === "skipped") &&
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
      <h1 className="text-[32px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
        Start with one goal.
      </h1>
      <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
        Tell Claude what you're working toward — anything from "lose 10 lbs" to
        "become a better dev." It'll compose a small, specific checklist for
        you each day.
      </p>

      <button
        onClick={onAdd}
        className={cn(
          "mt-7 inline-flex items-center gap-2 rounded-md bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-canvas)]",
          "transition-colors hover:bg-[var(--color-accent)]"
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Add a goal
      </button>
    </div>
  );
}

function NoChecklistYet({
  goals,
  onGenerate,
  generating,
  error,
  onAddGoal
}: {
  goals: Goal[];
  onGenerate: () => void;
  generating: boolean;
  error: Error | null;
  onAddGoal: () => void;
}) {
  return (
    <div className="mt-10">
      <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
        Ready when you are.
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[var(--color-ink-2)]">
        {goals.length === 1
          ? "Claude will compose today's action for your goal."
          : `Claude will compose today's action for each of your ${goals.length} active goals.`}{" "}
        Takes roughly 30 seconds per goal.
      </p>

      <ul className="mt-6 space-y-1.5">
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-2 text-[13px] text-[var(--color-ink-2)]"
          >
            <span className="h-1 w-1 rounded-full bg-[var(--color-ink-3)]" />
            {g.title}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex items-center gap-2">
        <button
          onClick={onGenerate}
          disabled={generating}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-medium",
            "bg-[var(--color-ink)] text-[var(--color-canvas)]",
            "transition-colors hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
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
        </button>
        <button
          onClick={onAddGoal}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-rule)] px-3 py-2.5 text-[12px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          Add another goal
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-[12px] text-[var(--color-ink-2)]">
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
  generating,
  topUpCount,
  allDone
}: {
  items: Suggestion[];
  placeholders: InFlightGoal[];
  goalsById: Map<string, Goal>;
  onOpenSuggestion: (id: string) => void;
  onRefresh: () => void;
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
            style={{ animation: `fade-up 320ms ${Math.min(idx, 6) * 40}ms backwards ease-out` }}
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
              animation: `fade-up 320ms ${Math.min(idx + items.length, 6) * 40}ms backwards ease-out`
            }}
          >
            <GeneratingRow goalTitle={p.title} />
          </li>
        ))}
      </ul>

      {allDone && <AllCaughtUp />}

      {topUpCount > 0 && (
        <div className="mt-8 flex items-center justify-end border-t border-[var(--color-rule)] pt-4 text-[12px] text-[var(--color-ink-3)]">
          <button
            onClick={onRefresh}
            disabled={generating}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
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
