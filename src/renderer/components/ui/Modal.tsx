import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
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

const backdropClasses = cn(
  "fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px]",
  "transition-opacity duration-150 ease-out",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
);

const popupClasses = (size: "sm" | "md", className?: string) =>
  cn(
    "fixed left-1/2 top-1/2 z-50 w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2",
    "rounded-2xl border border-[var(--color-rule)] bg-[var(--color-canvas)]",
    "shadow-[0_30px_60px_-20px_oklch(20%_0.01_60/0.25),0_8px_20px_-8px_oklch(20%_0.01_60/0.15)]",
    "transition-[opacity,transform] duration-150 ease-out",
    "data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-[calc(50%-6px)] data-[starting-style]:scale-[0.97]",
    "data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-[calc(50%-6px)] data-[ending-style]:scale-[0.97]",
    size === "sm" ? "max-w-md" : "max-w-lg",
    className
  );

/**
 * Shared modal chrome on Base UI Dialog: portal, scrim, focus trap, Escape
 * and backdrop dismissal all come from the primitive. `role="alertdialog"`
 * switches to AlertDialog semantics (no light-dismiss on a destructive
 * confirm).
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
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (role === "alertdialog") {
    return (
      <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={cn(backdropClasses, "z-50")} />
          <AlertDialog.Popup
            aria-labelledby={labelledBy}
            className={popupClasses(size, className)}
          >
            {children}
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cn(backdropClasses, "z-50")} />
        <Dialog.Popup aria-labelledby={labelledBy} className={popupClasses(size, className)}>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
