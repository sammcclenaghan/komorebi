import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";

/**
 * An aside that qualifies the content around it: a prerequisite, a
 * degraded dependency, a consequence.
 *
 * The tone is the signal, so there is no icon and no coloured tile — and
 * because tone carries meaning, `secondary` is right far more often than
 * the coloured variants.
 */
const note = cva("rounded-lg border px-4 py-3 text-copy-14", {
  variants: {
    tone: {
      secondary: "border-alpha-400 bg-background-200 text-gray-900 dark:bg-gray-100",
      warning: "border-amber-400 bg-amber-100 text-amber-900",
      error: "border-red-400 bg-red-100 text-red-900",
      success: "border-green-400 bg-green-100 text-green-900"
    }
  },
  defaultVariants: { tone: "secondary" }
});

type Props = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof note> & {
    /** Sits above the body in the tone's own colour. */
    title?: React.ReactNode;
    /** Rendered right-aligned on wide screens, below the text on narrow. */
    action?: React.ReactNode;
  };

export function Note({ tone, title, action, className, children, ...rest }: Props) {
  return (
    <aside className={cn(note({ tone }), className)} {...rest}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {title && <p className="text-heading-14 text-current">{title}</p>}
          {children && <div className={cn(title && "mt-1", "text-current")}>{children}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </aside>
  );
}
