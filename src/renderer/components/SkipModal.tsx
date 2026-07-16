import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

/** Tap-to-fill steering presets. Full sentences — the composer reads them verbatim. */
const QUICK_REASONS = [
  "Too big for today",
  "Not useful for this goal",
  "Already did something like this",
  "Wrong angle — try a different kind of task",
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fires with the trimmed reason ("" when none given); caller runs the skip. */
  onConfirm: (reason: string) => void;
  pending?: boolean;
};

export function SkipModal({ open, onClose, onConfirm, pending }: Props) {
  const [draft, setDraft] = useState("");

  // Fresh slate each time it opens.
  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="skip-title" size="sm">
      <div className="p-6">
        <h2 id="skip-title" className="text-xl font-semibold text-[var(--color-ink)]">
          Skip — try another
        </h2>
        <p className="mt-2 text-base leading-relaxed text-[var(--color-ink-2)]">
          Optionally tell Komorebi why. It steers what gets composed next.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => {
            const selected = draft === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setDraft(selected ? "" : r)}
                className={cn(
                  "pressable rounded-full border px-3 py-1.5 text-sm",
                  selected
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-tint)] text-[var(--color-accent-strong)]"
                    : "border-[var(--color-rule)] text-[var(--color-ink-2)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)] active:border-[var(--color-rule-2)] active:text-[var(--color-ink)]"
                )}
              >
                {r}
              </button>
            );
          })}
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Or say it in your own words…"
          className="input mt-3 resize-none"
        />

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="md" onClick={() => onConfirm(draft.trim())} disabled={pending}>
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
            Skip &amp; compose another
          </Button>
        </div>
      </div>
    </Modal>
  );
}
