import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Target, Loader2 } from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import type { Goal } from "~/shared/types";

export function Goals() {
  const queryClient = useQueryClient();
  const [modalGoal, setModalGoal] = useState<Goal | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list()
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.komorebi.goals.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
      setConfirmDelete(null);
    }
  });

  const goals = goalsQuery.data ?? [];
  const active = goals.filter((g) => g.status === "active");

  return (
    <>
      <div className="page-shell">
        <header>
          <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
            <Target className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              goals
            </span>
          </div>

          <div className="mt-3 flex items-start justify-between gap-6">
            <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
              What you're working toward.
            </h1>

            <button
              onClick={() => setModalGoal(null)}
              className={cn(
                "pressable shrink-0 whitespace-nowrap",
                "inline-flex items-center gap-1.5 rounded-md bg-[var(--color-ink)] px-3 py-1.5 text-[12.5px] font-medium",
                "text-[var(--color-canvas)] hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]"
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New goal
            </button>
          </div>

          <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            Edit context to sharpen the suggestions, or delete a goal when
            you're done with it.
          </p>
        </header>

        <div className="mt-10">
          {goalsQuery.isLoading ? (
            <LoadingList />
          ) : goals.length === 0 ? (
            <EmptyState onAdd={() => setModalGoal(null)} />
          ) : (
            <ul className="space-y-3">
              {goals.map((g) => (
                <li key={g.id}>
                  <GoalCard
                    goal={g}
                    onEdit={() => setModalGoal(g)}
                    onDelete={() => setConfirmDelete(g)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {goals.length > 0 && active.length === 0 && (
          <div className="mt-10 rounded-lg border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3 text-[12.5px] text-[var(--color-ink-2)]">
            No active goals — add one to start getting suggestions on Today.
          </div>
        )}
      </div>

      <GoalModal
        open={modalGoal !== undefined}
        goal={modalGoal}
        onClose={() => setModalGoal(undefined)}
      />

      <ConfirmDelete
        goal={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        pending={remove.isPending}
      />
    </>
  );
}

function GoalCard({
  goal,
  onEdit,
  onDelete
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={cn(
        "group rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4",
        "transition-colors hover:border-[var(--color-rule-2)]"
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">
            {goal.title}
          </h3>
          {goal.description && (
            <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-2)]">
              {goal.description}
            </p>
          )}
        </div>

        {/* Hover-revealed on pointer devices; always visible on touch, where an
            invisible-but-tappable button would delete/edit by accident. */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            onClick={onEdit}
            className="pressable-sm rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] active:bg-[var(--color-panel)]"
            aria-label="Edit goal"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            onClick={onDelete}
            className="pressable-sm rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] active:bg-[var(--color-panel)]"
            aria-label="Delete goal"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {goal.context && (
        <div className="mt-3 border-t border-[var(--color-rule)] pt-3">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            context for Komorebi
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)] whitespace-pre-wrap">
            {goal.context}
          </p>
        </div>
      )}
    </article>
  );
}

function LoadingList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[92px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]"
          style={{ animation: `fade-up 400ms ${i * 60}ms backwards ease-out` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-rule-2)] bg-[var(--color-panel)] px-6 py-12 text-center">
      <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-ink)]">
        No goals yet.
      </h2>
      <p className="mt-2 text-[13px] text-[var(--color-ink-2)]">
        Add one to start getting daily suggestions.
      </p>
      <button
        onClick={onAdd}
        className={cn(
          "pressable mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-medium",
          "text-[var(--color-canvas)] hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]"
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Add a goal
      </button>
    </div>
  );
}

function ConfirmDelete({
  goal,
  onClose,
  onConfirm,
  pending
}: {
  goal: Goal | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  if (!goal) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ animation: "fade-up 180ms ease-out" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px]"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl border border-[var(--color-rule)] bg-[var(--color-canvas)] p-6 shadow-[0_30px_60px_-20px_oklch(20%_0.01_60/0.25)]"
      >
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--color-ink)]">
          Delete this goal?
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          “{goal.title}” and all of its past suggestions and reflections will be
          removed. This can't be undone.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="pressable rounded-md px-3 py-2 text-[12px] text-[var(--color-ink-2)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] active:bg-[var(--color-panel)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "pressable inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium",
              "bg-[oklch(58%_0.18_25)] text-[var(--color-canvas)]",
              "hover:opacity-90 disabled:opacity-60"
            )}
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            Delete goal
          </button>
        </div>
      </div>
    </div>
  );
}
