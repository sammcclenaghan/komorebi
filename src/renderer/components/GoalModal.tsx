import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Modal } from "./ui/Modal";
import type { Goal, GoalPriority } from "~/shared/schema";

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
  const [priority, setPriority] = useState<GoalPriority>("medium");
  const titleRef = useRef<HTMLInputElement | null>(null);
  const isEdit = Boolean(goal);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setContext(goal.context ?? "");
      setPriority(goal.priority ?? "medium");
    } else {
      setTitle("");
      setDescription("");
      setContext("");
      setPriority("medium");
    }
    const focusTimer = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [open, goal]);

  const save = useMutation({
    mutationFn: async () => {
      if (goal) {
        return window.komorebi.goals.update({
          id: goal.id,
          updates: {
            title: title.trim(),
            description: description.trim() || null,
            context: context.trim() || null,
            priority
          }
        });
      }
      return window.komorebi.goals.add({
        title: title.trim(),
        description: description.trim() || undefined,
        context: context.trim() || undefined,
        priority
      });
    },
    onSuccess: (savedGoal) => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
      onSaved?.(savedGoal.id);
      onClose();
    }
  });

  return (
    <Modal open={open} onClose={onClose} labelledBy="goal-modal-title">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] px-6 py-4">
        <div>
          <div className="font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
            {isEdit ? "edit goal" : "new goal"}
          </div>
          <h2 id="goal-modal-title" className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
            {isEdit ? "Refine your goal" : "What are you working toward?"}
          </h2>
        </div>
        <IconButton onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" strokeWidth={2} />
        </IconButton>
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
            className="input"
          />
        </Field>

        <Field
          label="Priority"
          hint="On busy days Komorebi composes fewer actions. Higher-priority goals get the slots first; lower ones rotate in over the next few days."
        >
          <PriorityPicker value={priority} onChange={setPriority} />
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
            className="input resize-none"
          />
        </Field>

        <Field
          label="Context for Komorebi"
          optional
          hint="Optional but recommended. Level, preferences, how much time you have. The more specific you are, the less generic the suggestions."
        >
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            placeholder="Strong React + Node. Weakest on distributed systems. Prefer articles over books. ~30 min weekdays."
            className="input resize-none"
          />
        </Field>

        {save.isError && (
          <div className="mb-3 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink-2)]">
            {(save.error as Error).message}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || save.isPending}>
            {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {isEdit ? "Save changes" : "Save goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const PRIORITY_OPTIONS: { value: GoalPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" }
];

function PriorityPicker({
  value,
  onChange
}: {
  value: GoalPriority;
  onChange: (next: GoalPriority) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Priority"
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] p-0.5"
    >
      {PRIORITY_OPTIONS.map(({ value: optValue, label }) => {
        const selected = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optValue)}
            className={cn(
              "pressable rounded px-3 py-1.5 text-sm",
              selected
                ? "bg-[var(--color-canvas)] text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]"
            )}
          >
            {label}
          </button>
        );
      })}
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
        <span className="text-sm font-medium text-[var(--color-ink)]">{label}</span>
        {optional && (
          <span className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            optional
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}
