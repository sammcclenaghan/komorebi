import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, Pencil, Trash2, Target } from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { ConfirmDialog } from "../components/ui/Modal";
import type { Goal } from "~/shared/schema";

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
            <span className="font-mono text-2xs uppercase tracking-[0.22em]">
              goals
            </span>
          </div>

          <div className="mt-3 flex items-start justify-between gap-6">
            <h1 className="text-4xl font-semibold text-[var(--color-ink)]">
              What you're working toward.
            </h1>

            <Button size="sm" className="shrink-0" onClick={() => setModalGoal(null)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New goal
            </Button>
          </div>

          <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--color-ink-2)]">
            Edit context to sharpen the suggestions, or delete a goal when
            you're done with it.
          </p>
        </header>

        <div className="mt-10">
          {goalsQuery.isLoading ? (
            <LoadingList />
          ) : goalsQuery.isError ? (
            <ErrorState
              message={(goalsQuery.error as Error).message ?? "Unknown error"}
              onRetry={() => goalsQuery.refetch()}
            />
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
          <div className="mt-10 rounded-lg border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
            No active goals — add one to start getting suggestions on Today.
          </div>
        )}
      </div>

      <GoalModal
        open={modalGoal !== undefined}
        goal={modalGoal}
        onClose={() => setModalGoal(undefined)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        pending={remove.isPending}
        title="Delete this goal?"
        body={
          <>
            “{confirmDelete?.title}” and all of its past suggestions and reflections
            will be removed. This can't be undone.
          </>
        }
        confirmLabel="Delete goal"
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
          <h3 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
            {goal.title}
          </h3>
          {goal.description && (
            <p className="mt-1 text-base leading-snug text-[var(--color-ink-2)]">
              {goal.description}
            </p>
          )}
        </div>

        {/* Hover-revealed on pointer devices; always visible on touch, where an
            invisible-but-tappable button would delete/edit by accident. */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <IconButton onClick={onEdit} aria-label="Edit goal" title="Edit" className="h-9 w-9">
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton onClick={onDelete} aria-label="Delete goal" title="Delete" className="h-9 w-9">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </header>

      {goal.context && (
        <div className="mt-3 border-t border-[var(--color-rule)] pt-3">
          <div className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            context for Komorebi
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-2)] whitespace-pre-wrap">
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
          style={{ animation: `fade-up 400ms ${i * 60}ms backwards var(--ease-out-strong)` }}
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-accent-strong)]">
        <AlertCircle className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-2xl font-semibold text-[var(--color-ink)]">
        Couldn't load your goals.
      </h3>
      <p className="mt-3 font-mono text-xs text-[var(--color-ink-3)]">{message}</p>
      <button
        onClick={onRetry}
        className="pressable mt-6 rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-canvas)] hover:opacity-90 active:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-rule-2)] bg-[var(--color-panel)] px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-[var(--color-ink)]">
        No goals yet.
      </h2>
      <p className="mt-2 text-base text-[var(--color-ink-2)]">
        Add one to start getting daily suggestions.
      </p>
      <Button className="mt-5" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Add a goal
      </Button>
    </div>
  );
}
