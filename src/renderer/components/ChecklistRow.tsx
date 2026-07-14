import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, Loader2, RotateCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "~/lib/cn";
import type { ChecklistDay } from "~/main/checklist/orchestrator";
import type { Goal, Suggestion, SuggestionRating } from "~/shared/types";

type Props = {
  suggestion: Suggestion;
  goal: Goal | undefined;
  onOpen: () => void;
};

type ChecklistCache = ChecklistDay;

export function ChecklistRow({ suggestion, goal, onOpen }: Props) {
  const queryClient = useQueryClient();
  // Bumped each time the item is freshly completed, to retrigger the burst.
  const [burstKey, setBurstKey] = useState(0);

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
      window.komorebi.suggestions.setStatus({ id: suggestion.id, status: next }),
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
      window.komorebi.suggestions.setRating({ id: suggestion.id, rating: next }),
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

  const skipRegen = useMutation({
    mutationFn: () => window.komorebi.suggestions.skipAndRegenerate(suggestion.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["checklist", "today"] });
      return patchCache((s) => ({ ...s, status: "skipped" as const }));
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["checklist", "today"], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  const isDone = suggestion.status === "done";
  const isSkipped = suggestion.status === "skipped";
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
        isDone && rating && "opacity-90",
        isSkipped && "opacity-50"
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isSkipped) return;
            if (!isDone) setBurstKey((k) => k + 1);
            setStatus.mutate(isDone ? "pending" : "done");
          }}
          disabled={isSkipped}
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] transition-all",
            isDone
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-canvas)]"
              : isSkipped
                ? "border-[var(--color-rule-2)] bg-[var(--color-panel)] text-[var(--color-ink-3)]"
                : "border-[var(--color-rule-2)] bg-[var(--color-canvas)] hover:border-[var(--color-accent)]/60"
          )}
          aria-label={isDone ? "Mark as not done" : isSkipped ? "Skipped" : "Mark as done"}
        >
          {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
          {isSkipped && <span className="block h-[2px] w-[8px] bg-current rounded-full" aria-hidden />}
        </button>
        {burstKey > 0 && isDone && <CompletionBurst key={burstKey} />}
      </div>

      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <h3
          className={cn(
            "text-[14.5px] font-medium leading-snug text-[var(--color-ink)] transition-colors",
            (isDone || isSkipped) && "line-through decoration-[var(--color-ink-3)] decoration-[1px]"
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
          {isSkipped && (
            <span className="font-mono uppercase tracking-[0.14em]">skipped</span>
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

      {!isDone && !isSkipped && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            skipRegen.mutate();
          }}
          disabled={skipRegen.isPending}
          className={cn(
            // Hover-revealed, so hidden entirely on touch devices — otherwise it's
            // invisible but still tappable and skips by accident. The detail view
            // has an explicit skip button for touch.
            "mt-1.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-3)]/70 transition-colors [@media(hover:hover)]:flex",
            "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-panel)] hover:text-[var(--color-ink-2)]",
            skipRegen.isPending && "opacity-100 cursor-not-allowed"
          )}
          aria-label="Skip and generate a new one"
          title="Skip — try another"
        >
          {skipRegen.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>
      )}

      <ChevronRight
        className={cn(
          "mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] transition-opacity",
          "opacity-0 group-hover:opacity-60"
        )}
        strokeWidth={1.5}
      />
    </article>
  );
}

/**
 * A short burst of light flecks flung outward from the checkbox the
 * moment an item is completed. Pure CSS — mounts on a fresh `key`, plays
 * once, then sits invisible until the next completion remounts it.
 */
function CompletionBurst() {
  // Evenly-ish spread directions with a little variety in distance/size.
  const particles = [
    { angle: -90, dist: 22, size: 5 },
    { angle: -40, dist: 26, size: 4 },
    { angle: 12, dist: 24, size: 5 },
    { angle: 58, dist: 27, size: 3.5 },
    { angle: 120, dist: 23, size: 4.5 },
    { angle: 168, dist: 25, size: 4 },
    { angle: 218, dist: 21, size: 3.5 },
    { angle: -150, dist: 24, size: 4.5 }
  ];
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden>
      {particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = `${Math.cos(rad) * p.dist}px`;
        const ty = `${Math.sin(rad) * p.dist}px`;
        const warm = i % 2 === 0;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              background: warm
                ? "oklch(78% 0.13 130)"
                : "var(--color-accent)",
              ["--tx" as string]: tx,
              ["--ty" as string]: ty,
              ["--r" as string]: `${p.angle}deg`,
              animation: `leaf-burst 620ms cubic-bezier(0.22, 0.61, 0.36, 1) ${i * 8}ms both`
            }}
          />
        );
      })}
    </span>
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
        // Same deal as the skip button: hover-revealed, so touch devices hide it
        // rather than leave an invisible tap target. Rating lives in the detail
        // view's reflection capture on touch.
        "hidden h-7 w-7 items-center justify-center rounded-md transition-colors [@media(hover:hover)]:flex",
        "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-panel)]",
        active
          ? "text-[var(--color-accent-strong)]"
          : "text-[var(--color-ink-3)]/70 hover:text-[var(--color-ink-2)]",
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
