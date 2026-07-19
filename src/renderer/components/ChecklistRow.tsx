import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronRight,
  Clock,
  Ellipsis,
  Loader2,
  RotateCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Unlink
} from "lucide-react";
import { cn } from "~/lib/cn";
import type { Goal, Suggestion } from "~/shared/schema";
import { warningBadgeLabel, warningExplanation } from "../lib/generation-warning";
import { useSuggestionMutations } from "../lib/use-suggestion-mutations";
import { SkipModal } from "./SkipModal";
import { SwipeRow } from "./SwipeRow";

type Props = {
  suggestion: Suggestion;
  goal: Goal | undefined;
  onOpen: () => void;
};

export function ChecklistRow({ suggestion, goal, onOpen }: Props) {
  // Bumped each time the item is freshly completed, to retrigger the burst.
  const [burstKey, setBurstKey] = useState(0);
  const [skipOpen, setSkipOpen] = useState(false);

  const { setStatus, setRating, skipRegen, regenerate } = useSuggestionMutations(suggestion.id);

  const isDone = suggestion.status === "done";
  const isSkipped = suggestion.status === "skipped";
  const rating = suggestion.rating;
  const busy = skipRegen.isPending || regenerate.isPending;

  function toggleRating(next: "up" | "down") {
    setRating.mutate(rating === next ? null : next);
  }

  // Shared with the swipe-right action so both paths complete identically.
  function complete() {
    setBurstKey((k) => k + 1);
    setStatus.mutate("done");
  }

  return (
    <>
      <SwipeRow
        className="rounded-xl"
        disabled={isDone || isSkipped}
        leftAction={{
          content: <Check className="h-4 w-4" strokeWidth={3} />,
          className: "bg-[var(--color-ink)] text-[var(--color-canvas)]",
          onTrigger: complete
        }}
        rightAction={{
          content: <RotateCw className="h-4 w-4" strokeWidth={2} />,
          className: "bg-[var(--color-panel-2)] text-[var(--color-ink-2)]",
          onTrigger: () => setSkipOpen(true)
        }}
      >
        <article
          className={cn(
            "group relative flex items-start gap-4 rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-3.5",
            "pressable-row hover:border-[var(--color-rule-2)] hover:bg-[var(--color-panel-hover)] hover:shadow-[var(--shadow-md)]",
            "active:border-[var(--color-rule-2)] active:bg-[var(--color-panel-hover)]",
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
                if (!isDone) complete();
                else setStatus.mutate("pending");
              }}
              disabled={isSkipped}
              className={cn(
                "pressable-sm hit-target flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px]",
                isDone
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-canvas)]"
                  : isSkipped
                    ? "border-[var(--color-rule-2)] bg-[var(--color-panel)] text-[var(--color-ink-3)]"
                    : "border-[var(--color-rule-2)] bg-[var(--color-canvas)] hover:border-[var(--color-ink)]/40"
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
                "text-lg font-medium leading-snug text-[var(--color-ink)] transition-colors",
                (isDone || isSkipped) && "line-through decoration-[var(--color-ink-3)] decoration-[1px]"
              )}
            >
              {suggestion.title}
            </h3>
            <p className="mt-1 text-sm leading-snug text-[var(--color-ink-2)] line-clamp-1">
              {suggestion.summary}
            </p>
            <div className="mt-2 flex items-center gap-2.5 text-2xs text-[var(--color-ink-3)]">
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
              {suggestion.generationWarning && (
                <span
                  className="flex items-center gap-1 font-mono uppercase tracking-[0.14em]"
                  title={warningExplanation(suggestion.generationWarning)}
                >
                  <Unlink className="h-2.5 w-2.5" strokeWidth={2} />
                  {warningBadgeLabel(suggestion.generationWarning)}
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

          {/* Row actions: skip (pending rows) and regenerate (ANY row — a task
              is never stuck in a state it can't be redone from). */}
          <div
            className="mt-1 flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Menu.Root>
              <Menu.Trigger
                disabled={busy}
                aria-label="Row actions"
                className={cn(
                  // Hover-revealed on pointer devices; hidden on touch (the
                  // detail view has explicit buttons there).
                  "pressable-sm hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-3)]/70 [@media(hover:hover)]:flex",
                  "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-panel)] hover:text-[var(--color-ink-2)] active:bg-[var(--color-panel)]",
                  "data-[popup-open]:opacity-100 data-[popup-open]:bg-[var(--color-panel)]",
                  busy && "opacity-100 cursor-not-allowed"
                )}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={4} align="end" className="z-50">
                  <Menu.Popup
                    className={cn(
                      "min-w-[210px] rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)] py-1",
                      "shadow-[var(--shadow-lg)] origin-[var(--transform-origin)]",
                      "transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)]",
                      "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
                      "data-[ending-style]:opacity-0"
                    )}
                  >
                    {!isDone && !isSkipped && (
                      <MenuItem onClick={() => setSkipOpen(true)}>
                        <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Skip — try another
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => regenerate.mutate(undefined)}>
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Regenerate this task
                    </MenuItem>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>

          <ChevronRight
            className={cn(
              "mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] transition-opacity",
              "opacity-0 group-hover:opacity-60"
            )}
            strokeWidth={1.5}
          />
        </article>
      </SwipeRow>
      <SkipModal
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        pending={skipRegen.isPending}
        onConfirm={(reason) => {
          setSkipOpen(false);
          skipRegen.mutate(reason || undefined);
        }}
      />
    </>
  );
}

function MenuItem({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Menu.Item
      onClick={onClick}
      className={cn(
        "flex cursor-default select-none items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-ink-2)]",
        "data-[highlighted]:bg-[var(--color-panel)] data-[highlighted]:text-[var(--color-ink)]"
      )}
    >
      {children}
    </Menu.Item>
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
              background: warm ? "var(--color-leaf)" : "var(--color-ink-2)",
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
        // Hover-revealed, so touch devices hide it rather than leave an
        // invisible tap target. Rating lives in the detail view on touch.
        "pressable-sm hidden h-7 w-7 items-center justify-center rounded-md [@media(hover:hover)]:flex",
        "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-panel)] active:bg-[var(--color-panel)]",
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
