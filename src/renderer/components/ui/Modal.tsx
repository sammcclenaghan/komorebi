import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
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
  "fixed inset-0 bg-overlay",
  "transition-opacity duration-150 ease-out",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
);

const popupClasses = (size: "sm" | "md", className?: string) =>
  cn(
    "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
    "overflow-hidden rounded-xl bg-background-100 shadow-modal",
    "transition-[opacity,transform] duration-200 ease-[var(--ease-out-strong)]",
    "data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-[calc(50%-6px)] data-[starting-style]:scale-[0.98]",
    "data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-[calc(50%-6px)] data-[ending-style]:scale-[0.98]",
    size === "sm" ? "max-w-[420px]" : "max-w-[540px]",
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
  /** Verb + noun, matching the toast that follows: "Delete goal". */
  confirmLabel: string;
};

/**
 * A modal's title block. Scrolling content goes in a sibling below it, so
 * the title stays put while a long form scrolls.
 */
export function ModalHeader({
  id,
  title,
  description
}: {
  /** Must match the `labelledBy` given to `Modal`. */
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <header className="border-b border-alpha-400 px-6 py-5">
      <h2 id={id} className="text-heading-20 text-gray-1000">
        {title}
      </h2>
      {description && <p className="mt-1.5 text-copy-14 text-gray-900">{description}</p>}
    </header>
  );
}

/**
 * The one destructive-action confirm. The consequence is spelled out in the
 * body and the confirm button names what will happen — never "OK".
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  pending,
  title,
  body,
  confirmLabel
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} role="alertdialog" labelledBy="confirm-title" size="sm">
      <div className="px-6 pt-6 pb-5">
        <h2 id="confirm-title" className="text-heading-20 text-gray-1000">
          {title}
        </h2>
        <p className="mt-2 text-copy-14 text-gray-900">{body}</p>
      </div>

      <ModalFooter>
        <Button variant="secondary" size="md" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="error" size="md" onClick={onConfirm} loading={pending}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * The recessed action bar every modal ends with, so "cancel" and "confirm"
 * are always in the same place. Actions are right-aligned, with the
 * committing one last.
 */
export function ModalFooter({
  note,
  children
}: {
  /** Anything the user should read before committing. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 border-t border-alpha-400 px-6 py-4",
        "bg-background-200 dark:bg-gray-100"
      )}
    >
      {note && <p className="mr-auto text-copy-13 text-gray-900">{note}</p>}
      {children}
    </footer>
  );
}
