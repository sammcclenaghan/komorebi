import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "./Button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  role?: "dialog" | "alertdialog";
  /** id of the element that titles the dialog. */
  labelledBy?: string;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
};

/**
 * Shared modal chrome: scrim, Escape, backdrop tap, card. The card scales in
 * from just under full size with origin center (modals aren't anchored to a
 * trigger, so they're exempt from origin-aware scaling).
 */
export function Modal({
  open,
  onClose,
  role = "dialog",
  labelledBy,
  size = "md",
  className,
  children
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px]"
        style={{ animation: "fade-in 180ms ease-out" }}
      />
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "motion-safe-pop relative w-full rounded-2xl border border-[var(--color-rule)] bg-[var(--color-canvas)]",
          "shadow-[0_30px_60px_-20px_oklch(20%_0.01_60/0.25),0_8px_20px_-8px_oklch(20%_0.01_60/0.15)]",
          size === "sm" ? "max-w-md" : "max-w-lg",
          className
        )}
        style={{ animation: "modal-pop 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards" }}
      >
        {children}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** Rendered inside the confirm button when not pending. */
  confirmIcon?: React.ReactNode;
};

/** The one destructive-action confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  pending,
  title,
  body,
  confirmLabel,
  confirmIcon
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} role="alertdialog" labelledBy="confirm-title" size="sm">
      <div className="p-6">
        <h2 id="confirm-title" className="text-xl font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-[var(--color-ink-2)]">{body}</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : confirmIcon}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
