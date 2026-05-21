import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "~/lib/cn";
import type { Goal, Suggestion, SuggestionRating } from "~/shared/types";

type Props = {
  suggestion: Suggestion;
  goal: Goal | undefined;
  onOpen: () => void;
};

type ChecklistCache = { items: Suggestion[] } & Record<string, unknown>;

export function ChecklistRow({ suggestion, goal, onOpen }: Props) {
  const queryClient = useQueryClient();

  function patchCache(patch: (s: Suggestion) => Suggestion): { prev: ChecklistCache | undefined } {
    const prev = queryClient.getQueryData<ChecklistCache>(["checklist", "today"]);
    if (prev) {
      queryClient.setQueryData(["checklist", "today"], {
        ...prev,
        items: prev.items.map((s) => (s.id === suggestion.id ? patch(s) : s))
      });
    }
    return { prev };
  }

  const setStatus = useMutation({
    mutationFn: (next: Suggestion["status"]) =>
      window.goalpath.suggestions.setStatus({ id: suggestion.id, status: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["checklist", "today"] });
      return patchCache((s) => ({ ...s, status: next }));
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["checklist", "today"], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  const setRating = useMutation({
    mutationFn: (next: SuggestionRating) =>
      window.goalpath.suggestions.setRating({ id: suggestion.id, rating: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["checklist", "today"] });
      return patchCache((s) => ({ ...s, rating: next }));
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["checklist", "today"], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
      void queryClient.invalidateQueries({ queryKey: ["suggestion", suggestion.id] });
    }
  });

  const isDone = suggestion.status === "done";
  const rating = suggestion.rating;

  function toggleRating(next: "up" | "down") {
    setRating.mutate(rating === next ? null : next);
  }

  return (
    <article
      className={cn(
        "group relative flex items-start gap-4 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5",
        "transition-all hover:border-[var(--color-rule-2)] hover:bg-[var(--color-panel-hover)]",
        isDone && !rating && "opacity-60",
        isDone && rating && "opacity-90"
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

      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
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
            <span className="font-mono uppercase tracking-[0.14em]">{goal.title}</span>
          )}
          {suggestion.estimatedMinutes != null && (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
              {suggestion.estimatedMinutes}m
            </span>
          )}
        </div>
      </button>

      {isDone && (
        <div
          className="mt-1.5 flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <RatingThumb
            kind="up"
            active={rating === "up"}
            disabled={setRating.isPending}
            onClick={() => toggleRating("up")}
          />
          <RatingThumb
            kind="down"
            active={rating === "down"}
            disabled={setRating.isPending}
            onClick={() => toggleRating("down")}
          />
        </div>
      )}

      <ChevronRight
        className={cn(
          "mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] transition-opacity",
          isDone ? "opacity-0 group-hover:opacity-60" : "opacity-0 group-hover:opacity-100"
        )}
        strokeWidth={1.5}
      />
    </article>
  );
}

function RatingThumb({
  kind,
  active,
  disabled,
  onClick
}: {
  kind: "up" | "down";
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active
          ? "text-[var(--color-accent-strong)]"
          : "text-[var(--color-ink-3)]/70 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-panel)] hover:text-[var(--color-ink-2)]",
        active && "opacity-100",
        disabled && "cursor-not-allowed"
      )}
      aria-label={kind === "up" ? "Rate good" : "Rate poor"}
      aria-pressed={active}
    >
      <Icon
        className="h-3.5 w-3.5"
        strokeWidth={active ? 2.5 : 2}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
