import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock } from "lucide-react";
import { cn } from "~/lib/cn";
import type { Goal, Suggestion } from "~/shared/types";

type Props = {
  suggestion: Suggestion;
  goal: Goal | undefined;
  onOpen: () => void;
};

export function ChecklistRow({ suggestion, goal, onOpen }: Props) {
  const queryClient = useQueryClient();

  const setStatus = useMutation({
    mutationFn: (next: Suggestion["status"]) =>
      window.goalpath.suggestions.setStatus({ id: suggestion.id, status: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["checklist", "today"] });
      const prev = queryClient.getQueryData<{ items: Suggestion[] }>(["checklist", "today"]);
      if (prev) {
        queryClient.setQueryData(["checklist", "today"], {
          ...prev,
          items: prev.items.map((s) =>
            s.id === suggestion.id ? { ...s, status: next } : s
          )
        });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["checklist", "today"], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  const isDone = suggestion.status === "done";

  return (
    <article
      className={cn(
        "group relative flex items-start gap-4 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5",
        "transition-all hover:border-[var(--color-rule-2)] hover:bg-[var(--color-panel-hover)]",
        isDone && "opacity-60"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setStatus.mutate(isDone ? "pending" : "done");
        }}
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all",
          isDone
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-canvas)]"
            : "border-[var(--color-rule-2)] bg-[var(--color-canvas)] hover:border-[var(--color-accent)]/60"
        )}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
      >
        {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>

      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <h3
          className={cn(
            "text-[14.5px] font-medium leading-snug text-[var(--color-ink)] transition-colors",
            isDone && "line-through decoration-[var(--color-ink-3)] decoration-[1px]"
          )}
        >
          {suggestion.title}
        </h3>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-2)] line-clamp-1">
          {suggestion.summary}
        </p>
        <div className="mt-2 flex items-center gap-2.5 text-[10.5px] text-[var(--color-ink-3)]">
          {goal && (
            <span className="font-mono uppercase tracking-[0.14em]">
              {goal.title}
            </span>
          )}
          {suggestion.estimatedMinutes != null && (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
              {suggestion.estimatedMinutes}m
            </span>
          )}
        </div>
      </button>

      <ChevronRight
        className="mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={1.5}
      />
    </article>
  );
}
