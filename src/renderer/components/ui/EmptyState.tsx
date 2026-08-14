import { cn } from "~/lib/cn";
import { Button } from "./Button";

/**
 * What to show where content will eventually be. States the situation,
 * then offers the one action that ends it.
 *
 * Deliberately plain: no illustration, no oversized icon in a tinted
 * circle. An empty list is not an occasion.
 */
export function EmptyState({
  title,
  description,
  className,
  children
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  /** The action that fills the space. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-alpha-500 px-6 py-14 text-center",
        className
      )}
    >
      <h2 className="text-heading-16 text-gray-1000">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-[44ch] text-copy-14 text-gray-900">{description}</p>
      )}
      {children && <div className="mt-5 flex items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * A failed fetch, which is never the same thing as "nothing here". Always
 * offers the retry, and shows the message verbatim in mono so it can be
 * copied into a bug report.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retrying,
  className
}: {
  title: string;
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-red-400 bg-red-100 px-5 py-4", className)}>
      <h2 className="text-heading-14 text-red-900">{title}</h2>
      {message && (
        <p className="mt-1.5 font-mono text-mono-12 break-words text-red-900/80">{message}</p>
      )}
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} loading={retrying}>
        Try again
      </Button>
    </div>
  );
}
