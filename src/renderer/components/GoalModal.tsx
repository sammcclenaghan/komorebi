import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { cn } from "~/lib/cn";
import type { Goal } from "~/shared/types";

type Props = {
  open: boolean;
  /** When provided, modal opens in edit mode for that goal. */
  goal?: Goal | null;
  onClose: () => void;
  onSaved?: (goalId: string) => void;
};

export function GoalModal({ open, goal, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const isEdit = Boolean(goal);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setContext(goal.context ?? "");
    } else {
      setTitle("");
      setDescription("");
      setContext("");
    }
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, goal]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = useMutation({
    mutationFn: async () => {
      if (goal) {
        return window.goalpath.goals.update({
          id: goal.id,
          updates: {
            title: title.trim(),
            description: description.trim() || null,
            context: context.trim() || null
          }
        });
      }
      return window.goalpath.goals.add({
        title: title.trim(),
        description: description.trim() || undefined,
        context: context.trim() || undefined
      });
    },
    onSuccess: (savedGoal) => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
      onSaved?.(savedGoal.id);
      onClose();
    }
  });

  if (!open) return null;

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
        className="absolute inset-0 bg-[var(--color-ink)]/15 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-modal-title"
        className={cn(
          "relative w-full max-w-lg rounded-2xl border border-[var(--color-rule)] bg-[var(--color-canvas)]",
          "shadow-[0_30px_60px_-20px_oklch(20%_0.01_60/0.25),0_8px_20px_-8px_oklch(20%_0.01_60/0.15)]"
        )}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-rule)] px-6 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
              {isEdit ? "edit goal" : "new goal"}
            </div>
            <h2 id="goal-modal-title" className="mt-1 text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
              {isEdit ? "Refine your goal" : "What are you working toward?"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || save.isPending) return;
            save.mutate();
          }}
          className="px-6 py-5"
        >
          <Field
            label="Title"
            hint="Plain language. 'Become a better dev', 'Lose 10 lbs', 'Read more fiction'."
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Become a better developer"
              className="w-full rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </Field>

          <Field
            label="Description"
            optional
            hint="Optional. One sentence on the underlying intent."
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Senior TS engineer who wants deeper systems intuition."
              className="w-full resize-none rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </Field>

          <Field
            label="Context for Claude"
            optional
            hint="Optional but recommended. Level, preferences, how much time you have. The more specific you are, the less generic the suggestions."
          >
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              placeholder="Strong React + Node. Weakest on distributed systems. Prefer articles over books. ~30 min weekdays."
              className="w-full resize-none rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3 py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </Field>

          {save.isError && (
            <div className="mb-3 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-[12px] text-[var(--color-ink-2)]">
              {(save.error as Error).message}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-[12px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || save.isPending}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-medium",
                "bg-[var(--color-ink)] text-[var(--color-canvas)]",
                "transition-colors hover:bg-[var(--color-accent)]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {isEdit ? "Save changes" : "Save goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  children
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[12px] font-medium text-[var(--color-ink)]">{label}</span>
        {optional && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            optional
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}
