import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "~/lib/cn";

/**
 * Shared chrome for every dropdown in the app, so a row's overflow menu
 * and a page's action menu are the same object. Base UI owns the
 * positioning, focus and dismissal; this owns how it looks.
 */
export const menuPopupClasses = cn(
  "min-w-[200px] rounded-lg border border-alpha-400 bg-background-100 p-1",
  "shadow-menu origin-[var(--transform-origin)]",
  "transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)]",
  "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
  "data-[ending-style]:opacity-0"
);

export function MenuItem({
  onClick,
  destructive,
  children
}: {
  onClick: () => void;
  /** Deletes something. Sits last, separated from the rest. */
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-[4px] px-2 text-label-14 outline-none select-none",
        destructive
          ? "text-red-900 data-[highlighted]:bg-red-100"
          : "text-gray-900 data-[highlighted]:bg-alpha-100 data-[highlighted]:text-gray-1000"
      )}
    >
      {children}
    </BaseMenu.Item>
  );
}

/** A hairline between groups of items with different consequences. */
export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-alpha-400" />;
}
