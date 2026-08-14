import { cn } from "~/lib/cn";

/**
 * Every page opens the same way: the page's name, one line about what it
 * is for, and the page's primary action on the right.
 *
 * There is no eyebrow and no icon above the title. The sidebar already
 * says where you are, and a tracked all-caps label above every heading was
 * the loudest thing in the old design.
 */
export function PageHeader({
  title,
  description,
  action,
  className
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The page's single primary action. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        <h1 className="text-heading-24 text-gray-1000">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[52ch] text-copy-14 text-gray-900">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
