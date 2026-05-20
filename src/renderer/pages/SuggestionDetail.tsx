import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, Clock, Loader2, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "~/lib/cn";
import { MarkdownView } from "../components/MarkdownView";
import type { Suggestion } from "~/shared/types";

type Props = {
  suggestionId: string;
  onBack: () => void;
};

export function SuggestionDetail({ suggestionId, onBack }: Props) {
  const queryClient = useQueryClient();

  const suggestionQuery = useQuery({
    queryKey: ["suggestion", suggestionId],
    queryFn: () => window.goalpath.suggestions.get(suggestionId)
  });

  const reflectionsQuery = useQuery({
    queryKey: ["reflections", suggestionId],
    queryFn: () => window.goalpath.reflections.list(suggestionId)
  });

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.goalpath.goals.list()
  });

  const setStatus = useMutation({
    mutationFn: (next: Suggestion["status"]) =>
      window.goalpath.suggestions.setStatus({ id: suggestionId, status: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suggestion", suggestionId] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (suggestionQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-10 pt-16 pb-20">
        <BackButton onClick={onBack} />
        <div className="mt-10 h-8 w-2/3 rounded-md bg-[var(--color-panel)]" />
        <div className="mt-4 h-4 w-1/2 rounded-md bg-[var(--color-panel)]" />
      </div>
    );
  }

  const suggestion = suggestionQuery.data;
  if (!suggestion) {
    return (
      <div className="mx-auto max-w-2xl px-10 pt-16 pb-20">
        <BackButton onClick={onBack} />
        <h1 className="mt-10 text-[24px] font-semibold text-[var(--color-ink)]">
          Suggestion not found.
        </h1>
      </div>
    );
  }

  const goal = goalsQuery.data?.find((g) => g.id === suggestion.goalId);
  const isDone = suggestion.status === "done";

  return (
    <div className="mx-auto max-w-2xl px-10 pt-12 pb-24">
      <BackButton onClick={onBack} />

      <header className="mt-8">
        <div className="flex items-center gap-2 text-[var(--color-ink-3)]">
          {goal && (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              {goal.title}
            </span>
          )}
          {suggestion.estimatedMinutes != null && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                {suggestion.estimatedMinutes} min
              </span>
            </>
          )}
        </div>

        <h1 className="mt-3 text-[28px] font-semibold leading-[1.2] tracking-tight text-[var(--color-ink)]">
          {suggestion.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
          {suggestion.summary}
        </p>

        {suggestion.resourceUrl && (
          <a
            href={suggestion.resourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "mt-5 inline-flex items-center gap-2 rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3.5 py-2",
              "text-[12.5px] text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-tint)]"
            )}
          >
            <span className="truncate max-w-[28ch] text-[var(--color-ink-2)] font-mono text-[11.5px]">
              {prettifyUrl(suggestion.resourceUrl)}
            </span>
            <ArrowUpRight className="h-3 w-3 shrink-0" strokeWidth={2} />
          </a>
        )}
      </header>

      <hr className="my-8 border-0 border-t border-[var(--color-rule)]" />

      <article>
        <MarkdownView source={suggestion.detailMarkdown} />
      </article>

      <hr className="my-10 border-0 border-t border-[var(--color-rule)]" />

      <section>
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
          Status
        </h2>

        {isDone ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-tint)] px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-[var(--color-accent-strong)]">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span>Marked done{suggestion.completedAt && ` ${formatRelative(suggestion.completedAt)}`}.</span>
              </div>
              <button
                onClick={() => setStatus.mutate("pending")}
                disabled={setStatus.isPending}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={2} />
                Undo
              </button>
            </div>

            <ReflectionCapture
              suggestionId={suggestionId}
              hasReflection={(reflectionsQuery.data?.length ?? 0) > 0}
            />
          </div>
        ) : (
          <button
            onClick={() => setStatus.mutate("done")}
            disabled={setStatus.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-medium",
              "bg-[var(--color-ink)] text-[var(--color-canvas)]",
              "transition-colors hover:bg-[var(--color-accent)] disabled:opacity-60"
            )}
          >
            {setStatus.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            Mark done
          </button>
        )}
      </section>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
      Today
    </button>
  );
}

function ReflectionCapture({
  suggestionId,
  hasReflection
}: {
  suggestionId: string;
  hasReflection: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [done, setDone] = useState(hasReflection);

  const add = useMutation({
    mutationFn: () =>
      window.goalpath.reflections.add({
        suggestionId,
        text: text.trim(),
        rating
      }),
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ["reflections", suggestionId] });
    }
  });

  if (done) {
    return (
      <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3 text-[12.5px] text-[var(--color-ink-2)]">
        Thanks — saved. Claude will use this next time it composes for this goal.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-4">
      <label className="text-[12px] font-medium text-[var(--color-ink)]">
        How was it?
        <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          optional
        </span>
      </label>
      <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
        One line is fine. Skip if you'd rather not.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Notes for next time…"
        className="mt-2.5 w-full resize-none rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <RatingButton active={rating === "up"} onClick={() => setRating(rating === "up" ? null : "up")}>
            <ThumbsUp className="h-3 w-3" strokeWidth={2} />
          </RatingButton>
          <RatingButton active={rating === "down"} onClick={() => setRating(rating === "down" ? null : "down")}>
            <ThumbsDown className="h-3 w-3" strokeWidth={2} />
          </RatingButton>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDone(true)}
            className="text-[11.5px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
          >
            Skip
          </button>
          <button
            onClick={() => add.mutate()}
            disabled={!text.trim() || add.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium",
              "bg-[var(--color-ink)] text-[var(--color-canvas)]",
              "transition-colors hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {add.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border p-1.5 transition-colors",
        active
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-tint)] text-[var(--color-accent-strong)]"
          : "border-[var(--color-rule)] text-[var(--color-ink-3)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function prettifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname : "";
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
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
