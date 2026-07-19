import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  RotateCcw,
  RotateCw,
  SkipForward,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Unlink
} from "lucide-react";
import { cn } from "~/lib/cn";
import { MarkdownView } from "../components/MarkdownView";
import { MediaEmbed } from "../components/MediaEmbed";
import { SkipModal } from "../components/SkipModal";
import { Button } from "../components/ui/Button";
import type { Suggestion, SuggestionRating } from "~/shared/schema";
import { warningExplanation } from "../lib/generation-warning";
import { useSuggestionMutations } from "../lib/use-suggestion-mutations";

type Props = {
  suggestionId: string;
  onBack: () => void;
};

export function SuggestionDetail({ suggestionId, onBack }: Props) {
  const [skipOpen, setSkipOpen] = useState(false);

  const suggestionQuery = useQuery({
    queryKey: ["suggestion", suggestionId],
    queryFn: () => window.komorebi.suggestions.get(suggestionId)
  });

  const reflectionsQuery = useQuery({
    queryKey: ["reflections", suggestionId],
    queryFn: () => window.komorebi.reflections.list(suggestionId)
  });

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list()
  });

  // Same optimistic mutations as the checklist row — status and rating
  // changes render instantly here too.
  const { setStatus, setRating, skipRegen, regenerate } = useSuggestionMutations(suggestionId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (suggestionQuery.isLoading) {
    return (
      <div className="page-shell">
        <BackButton onClick={onBack} />
        <div className="mt-10 h-8 w-2/3 rounded-md bg-[var(--color-panel)]" />
        <div className="mt-4 h-4 w-1/2 rounded-md bg-[var(--color-panel)]" />
      </div>
    );
  }

  // A fetch failure is not "not found" — offer a retry instead of a dead end.
  if (suggestionQuery.isError) {
    return (
      <div className="page-shell">
        <BackButton onClick={onBack} />
        <h1 className="mt-10 text-2xl font-semibold text-[var(--color-ink)]">
          Couldn't load this suggestion.
        </h1>
        <p className="mt-2 text-base text-[var(--color-ink-2)]">
          {(suggestionQuery.error as Error)?.message ?? "Something went wrong."}
        </p>
        <Button
          variant="secondary"
          size="md"
          className="mt-5"
          onClick={() => void suggestionQuery.refetch()}
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2} />
          Try again
        </Button>
      </div>
    );
  }

  const suggestion = suggestionQuery.data;
  if (!suggestion) {
    return (
      <div className="page-shell">
        <BackButton onClick={onBack} />
        <h1 className="mt-10 text-2xl font-semibold text-[var(--color-ink)]">
          Suggestion not found.
        </h1>
      </div>
    );
  }

  const goal = goalsQuery.data?.find((g) => g.id === suggestion.goalId);
  const isDone = suggestion.status === "done";
  const isSkipped = suggestion.status === "skipped";
  const regenerating = regenerate.isPending;

  function regenerateAndBack() {
    regenerate.mutate(undefined, { onSuccess: () => onBack() });
  }

  return (
    <div className="page-shell pt-10 md:pt-12">
      <BackButton onClick={onBack} />

      <header className="mt-8">
        <div className="flex items-center gap-2 text-[var(--color-ink-3)]">
          {goal && (
            <span className="font-mono text-2xs uppercase tracking-[0.22em]">
              {goal.title}
            </span>
          )}
          {suggestion.estimatedMinutes != null && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-2xs">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                {suggestion.estimatedMinutes} min
              </span>
            </>
          )}
        </div>

        <h1 className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">
          {suggestion.title}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-[var(--color-ink-2)]">
          {suggestion.summary}
        </p>

        {suggestion.resourceUrl && <MediaEmbed url={suggestion.resourceUrl} />}
        {!suggestion.resourceUrl && suggestion.generationWarning && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
            <Unlink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {warningExplanation(suggestion.generationWarning)}
          </p>
        )}
      </header>

      <hr className="my-8 border-0 border-t border-[var(--color-rule)]" />

      <article>
        <MarkdownView source={suggestion.detailMarkdown} />
      </article>

      <hr className="my-10 border-0 border-t border-[var(--color-rule)]" />

      <section>
        <h2 className="mb-3 font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
          Status
        </h2>

        {isDone ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-tint)] px-4 py-3">
              <div className="flex items-center gap-2 text-base text-[var(--color-accent-strong)]">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span>Marked done{suggestion.completedAt && ` ${formatRelative(suggestion.completedAt)}`}.</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus.mutate("pending")}
                disabled={setStatus.isPending}
                className="px-2 py-1 text-xs hover:bg-[var(--color-canvas)] active:bg-[var(--color-canvas)]"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={2} />
                Undo
              </Button>
            </div>

            <ReflectionCapture
              suggestionId={suggestionId}
              rating={suggestion.rating}
              setRating={setRating}
              hasReflection={(reflectionsQuery.data?.length ?? 0) > 0}
            />
          </div>
        ) : isSkipped ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
            <div className="flex items-center gap-2 text-base text-[var(--color-ink-2)]">
              <SkipForward className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Skipped — a fresh one's on Today.</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus.mutate("pending")}
                disabled={setStatus.isPending || regenerating}
                className="px-2 py-1 text-xs hover:bg-[var(--color-canvas)] active:bg-[var(--color-canvas)]"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={2} />
                Undo skip
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={regenerateAndBack}
                disabled={regenerating}
                className="px-2 py-1 text-xs hover:bg-[var(--color-canvas)] active:bg-[var(--color-canvas)]"
              >
                {regenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" strokeWidth={2} />
                )}
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              onClick={() => setStatus.mutate("done")}
              disabled={setStatus.isPending || skipRegen.isPending || regenerating}
            >
              {setStatus.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              Mark done
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => setSkipOpen(true)}
              disabled={skipRegen.isPending || setStatus.isPending || regenerating}
            >
              {skipRegen.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {skipRegen.isPending ? "Composing another…" : "Skip — try another"}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={regenerateAndBack}
              disabled={skipRegen.isPending || setStatus.isPending || regenerating}
              title="Discard this and compose a fresh take"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        )}

        {regenerate.isError && (
          <p className="mt-3 text-sm text-[var(--color-ink-3)]">
            {(regenerate.error as Error)?.message ?? "Regeneration failed — try again."}
          </p>
        )}
      </section>

      <SkipModal
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        pending={skipRegen.isPending}
        onConfirm={(reason) => {
          setSkipOpen(false);
          skipRegen.mutate(reason || undefined, { onSuccess: () => onBack() });
        }}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pressable inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
      Today
    </button>
  );
}

function ReflectionCapture({
  suggestionId,
  rating,
  setRating,
  hasReflection
}: {
  suggestionId: string;
  rating: SuggestionRating;
  /** The shared optimistic rating mutation, so thumbs respond instantly. */
  setRating: UseMutationResult<Suggestion, Error, SuggestionRating, unknown>;
  hasReflection: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [textDone, setTextDone] = useState(hasReflection);

  const addText = useMutation({
    mutationFn: () =>
      window.komorebi.reflections.add({
        suggestionId,
        text: text.trim()
      }),
    onSuccess: () => {
      setText("");
      setTextDone(true);
      void queryClient.invalidateQueries({ queryKey: ["reflections", suggestionId] });
    }
  });

  function toggle(next: "up" | "down") {
    setRating.mutate(rating === next ? null : next);
  }

  return (
    <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-4">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-[var(--color-ink)]">
          How was it?
          <span className="ml-1.5 font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            optional
          </span>
        </label>
        <div className="flex items-center gap-1">
          <RatingButton active={rating === "up"} onClick={() => toggle("up")} aria-label="Rate good">
            <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2} fill={rating === "up" ? "currentColor" : "none"} />
          </RatingButton>
          <RatingButton active={rating === "down"} onClick={() => toggle("down")} aria-label="Rate poor">
            <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2} fill={rating === "down" ? "currentColor" : "none"} />
          </RatingButton>
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--color-ink-3)]">
        {textDone
          ? "Saved. Add another note any time."
          : "Quick rating, or jot a one-liner Komorebi will see next time. Skip if you'd rather not."}
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (textDone && e.target.value.length > 0) setTextDone(false);
        }}
        rows={2}
        placeholder="Notes for next time…"
        className="input mt-2.5 resize-none"
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        {!textDone && text.trim() && (
          <button
            onClick={() => setText("")}
            className="pressable text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]"
          >
            Clear
          </button>
        )}
        <Button size="sm" onClick={() => addText.mutate()} disabled={!text.trim() || addText.isPending}>
          {addText.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Save note
        </Button>
      </div>
    </div>
  );
}

function RatingButton({
  active,
  onClick,
  children,
  "aria-label": ariaLabel
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "pressable-sm rounded-md border p-2.5",
        active
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-tint)] text-[var(--color-accent-strong)]"
          : "border-[var(--color-rule)] text-[var(--color-ink-3)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)] active:border-[var(--color-rule-2)] active:text-[var(--color-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}
