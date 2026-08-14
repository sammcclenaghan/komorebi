import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import { ChevronRight, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "~/lib/cn";
import { GoalModal } from "../components/GoalModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { iconButtonClasses } from "../components/ui/IconButton";
import { MenuItem, MenuSeparator, menuPopupClasses } from "../components/ui/Menu";
import { Note } from "../components/ui/Note";
import { PageHeader } from "../components/ui/PageHeader";
import { SkeletonList } from "../components/ui/Skeleton";
import { ConfirmDialog } from "../components/ui/Modal";
import type { Goal, GoalPath } from "~/shared/schema";

export function Goals({ onOpenPath }: { onOpenPath?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [modalGoal, setModalGoal] = useState<Goal | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list()
  });

  const goals = goalsQuery.data ?? [];

  // Each goal's path decides what the row says and what its action is called,
  // so the list can distinguish "needs a path" from "running" at a glance.
  const pathQueries = useQueries({
    queries: goals.map((goal) => ({
      queryKey: ["path", goal.id],
      queryFn: () => window.komorebi.paths.get(goal.id)
    }))
  });
  const pathByGoalId = new Map<string, GoalPath | null>(
    goals.map((goal, index) => [goal.id, pathQueries[index]?.data ?? null])
  );

  const remove = useMutation({
    mutationFn: (id: string) => window.komorebi.goals.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
      setConfirmDelete(null);
    }
  });

  const active = goals.filter((goal) => goal.status === "active");

  return (
    <>
      <div className="page">
        <PageHeader
          title="Goals"
          description="A goal is a destination. Its path turns that destination into milestones, and today's actions come from whichever milestone you're on."
          action={
            <Button size="sm" onClick={() => setModalGoal(null)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New Goal
            </Button>
          }
        />

        <div className="mt-8">
          {goalsQuery.isLoading ? (
            <SkeletonList rows={3} height={88} />
          ) : goalsQuery.isError ? (
            <ErrorState
              title="Couldn't load your goals."
              message={(goalsQuery.error as Error).message ?? "Unknown error"}
              onRetry={() => void goalsQuery.refetch()}
              retrying={goalsQuery.isFetching}
            />
          ) : goals.length === 0 ? (
            <EmptyState
              title="No goals yet."
              description="Name one thing you're working toward. Komorebi researches a path to it, then composes a small action for it each day."
            >
              <Button onClick={() => setModalGoal(null)}>
                <Plus className="h-4 w-4" strokeWidth={2} />
                Add a Goal
              </Button>
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {goals.map((goal) => (
                <li key={goal.id}>
                  <GoalRow
                    goal={goal}
                    path={pathByGoalId.get(goal.id) ?? null}
                    onEdit={() => setModalGoal(goal)}
                    onDelete={() => setConfirmDelete(goal)}
                    onOpenPath={() => onOpenPath?.(goal.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {goals.length > 0 && active.length === 0 && (
          <Note className="mt-6" title="Nothing is active.">
            Today stays empty until at least one goal is active.
          </Note>
        )}
      </div>

      <GoalModal
        open={modalGoal !== undefined}
        goal={modalGoal}
        onClose={() => setModalGoal(undefined)}
        onSaved={(id) => {
          if (!modalGoal) onOpenPath?.(id);
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        pending={remove.isPending}
        title="Delete this goal?"
        body={
          <>
            “{confirmDelete?.title}”, its path, and every suggestion and reflection
            recorded against it will be removed. This can't be undone.
          </>
        }
        confirmLabel="Delete Goal"
      />
    </>
  );
}

/**
 * One goal as a single object: what it is, where its path stands, and one
 * click into that path. Edit and delete live in an overflow menu — they are
 * not what you came to this row to do, and a delete button that only appears
 * on hover is a delete button you press by accident.
 */
function GoalRow({
  goal,
  path,
  onEdit,
  onDelete,
  onOpenPath
}: {
  goal: Goal;
  path: GoalPath | null;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPath: () => void;
}) {
  const state = pathState(path);

  return (
    <article
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border border-alpha-400 bg-background-100",
        "pressable-row hover:border-alpha-500 hover:bg-gray-100"
      )}
    >
      <button onClick={onOpenPath} className="min-w-0 flex-1 px-4 py-3.5 text-left">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-heading-16 text-gray-1000">{goal.title}</h3>
          <Badge tone={state.tone}>{state.label}</Badge>
          {goal.priority !== "medium" && (
            <span className="text-copy-13 text-gray-700">{goal.priority} priority</span>
          )}
        </div>

        {goal.description && (
          <p className="mt-1 line-clamp-2 max-w-[60ch] text-copy-14 text-gray-900">
            {goal.description}
          </p>
        )}

        <p className="mt-2 text-copy-13 text-gray-700">{state.detail}</p>
      </button>

      <div className="flex shrink-0 items-center gap-1 py-3.5 pr-3">
        <Menu.Root>
          <Menu.Trigger
            aria-label={`Actions for ${goal.title}`}
            className={iconButtonClasses("md", "data-[popup-open]:bg-alpha-200")}
          >
            <Ellipsis className="h-4 w-4" strokeWidth={1.75} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4} align="end" className="z-50">
              <Menu.Popup className={menuPopupClasses}>
                <MenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Edit goal
                </MenuItem>
                <MenuSeparator />
                <MenuItem destructive onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Delete goal
                </MenuItem>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        <ChevronRight
          className="h-4 w-4 text-gray-700 opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
    </article>
  );
}

/**
 * What the row should say about this goal's path. Every state names both the
 * situation and what happens next, so no row is a dead end.
 */
function pathState(path: GoalPath | null): {
  label: string;
  tone: "gray" | "gray-solid" | "amber" | "red" | "green";
  detail: string;
} {
  if (!path) {
    return {
      label: "No path",
      tone: "amber",
      detail: "Open this goal to research a path. Daily actions start once one is active."
    };
  }

  const total = path.milestones.length;
  const done = path.milestones.filter((milestone) => milestone.status === "completed").length;
  const current = path.milestones.find((milestone) => milestone.status === "current");

  switch (path.status) {
    case "generating":
      return { label: "Researching", tone: "gray", detail: "Gathering sources and shaping milestones." };
    case "draft":
      return {
        label: "Draft",
        tone: "gray",
        detail: `${total} milestones proposed, waiting for your review.`
      };
    case "active":
      return {
        label: "Active",
        tone: "gray-solid",
        detail: current
          ? `Milestone ${done + 1} of ${total} — ${current.title}`
          : `${done} of ${total} milestones complete.`
      };
    case "completed":
      return { label: "Complete", tone: "green", detail: `All ${total} milestones reached.` };
    case "failed":
      return { label: "Needs attention", tone: "red", detail: "Research didn't finish. Open to retry." };
    case "superseded":
      return { label: "Replaced", tone: "gray", detail: "A newer version of this path took over." };
  }
}
