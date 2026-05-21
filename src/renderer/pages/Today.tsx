import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Loader2, Sunrise } from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import { ChecklistRow } from "../components/ChecklistRow";
import type { Goal, Suggestion } from "~/shared/types";

type Props = {
  onOpenSuggestion: (id: string) => void;
};

export function Today({ onOpenSuggestion }: Props) {
  const queryClient = useQueryClient();
  const [showAddGoal, setShowAddGoal] = useState(false);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.goalpath.goals.list()
  });

  const checklistQuery = useQuery({
    queryKey: ["checklist", "today"],
    queryFn: () => window.goalpath.checklist.today()
  });

  const generate = useMutation({
    mutationFn: () => window.goalpath.checklist.generate(),
    onSuccess: (data) => {
      queryClient.setQueryData(["checklist", "today"], data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
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

  const doneCount = items.filter((s) => s.status === "done").length;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  const isLoading = goalsQuery.isLoading || checklistQuery.isLoading;
  const noGoals = activeGoals.length === 0;
  const hasGoalsNoChecklist = !noGoals && items.length === 0;

  return (
    <>
      <div className="mx-auto max-w-2xl px-10 pt-16 pb-20">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
            <Sunrise className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              today &middot; {today}
            </span>
          </div>
          {items.length > 0 && (
            <div className="font-mono text-[11px] tabular-nums text-[var(--color-ink-3)]">
              <span className="text-[var(--color-ink)]">{doneCount}</span>
              <span className="opacity-60"> / </span>
              <span>{items.length}</span>
            </div>
          )}
        </header>

        {isLoading ? (
          <LoadingState />
        ) : noGoals ? (
          <NoGoalsState onAdd={() => setShowAddGoal(true)} />
        ) : hasGoalsNoChecklist ? (
          <NoChecklistYet
            goals={activeGoals}
            onGenerate={() => generate.mutate()}
            generating={generate.isPending}
            error={generate.error as Error | null}
            onAddGoal={() => setShowAddGoal(true)}
          />
        ) : (
          <ChecklistView
            items={items}
            goalsById={goalsById}
            onOpenSuggestion={onOpenSuggestion}
            onAddGoal={() => setShowAddGoal(true)}
            onRefresh={() => generate.mutate()}
            generating={generate.isPending}
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
  goalsById,
  onOpenSuggestion,
  onAddGoal,
  onRefresh,
  generating
}: {
  items: Suggestion[];
  goalsById: Map<string, Goal>;
  onOpenSuggestion: (id: string) => void;
  onAddGoal: () => void;
  onRefresh: () => void;
  generating: boolean;
}) {
  return (
    <div className="mt-8">
      <ul className="space-y-2.5">
        {items.map((s) => (
          <li key={s.id}>
            <ChecklistRow
              suggestion={s}
              goal={goalsById.get(s.goalId)}
              onOpen={() => onOpenSuggestion(s.id)}
            />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-between border-t border-[var(--color-rule)] pt-4 text-[12px] text-[var(--color-ink-3)]">
        <button
          onClick={onAddGoal}
          className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-ink)]"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          Add goal
        </button>
        <button
          onClick={onRefresh}
          disabled={generating}
          className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
          title="Generate suggestions for goals that don't have one today"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" strokeWidth={2} />
          )}
          {generating ? "Composing…" : "Top up"}
        </button>
      </div>
    </div>
  );
}
