import { cn } from "~/lib/cn";

type Tone = "default" | "error";

/**
 * A bordered surface that groups one decision: what it is, what it does,
 * and the control that changes it.
 *
 * Cards earn their border by containing an action. A section that only
 * reads — a heading and some prose — should be separated by space, not
 * boxed. Never nest one card inside another.
 */
export function Card({
  tone = "default",
  className,
  children
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-tone={tone}
      className={cn(
        "group/card overflow-hidden rounded-xl border bg-background-100",
        tone === "error" ? "border-red-400" : "border-alpha-400",
        className
      )}
    >
      {children}
    </section>
  );
}

/**
 * The card's own header. `title` is the noun; `description` says what
 * changing it will do. Both sit above the control, never beside it, so a
 * long description can't squeeze the control into a sliver.
 */
export function CardBody({
  title,
  description,
  className,
  children
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("px-5 py-5 md:px-6", className)}>
      {title && <h2 className="text-heading-20 text-gray-1000">{title}</h2>}
      {description && (
        <p className="mt-2 max-w-2xl text-copy-14 text-gray-900">{description}</p>
      )}
      {children && <div className={cn(title || description ? "mt-5" : undefined)}>{children}</div>}
    </div>
  );
}

/**
 * The recessed bar along the bottom. Holds the note that qualifies the
 * action on the left, and the action itself on the right — so the
 * commitment always lives in the same place on every card.
 */
export function CardFooter({
  note,
  className,
  children
}: {
  note?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <footer
      className={cn(
        "flex min-h-14 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:px-6",
        // Dark mode's page is true black, so a recessed surface has to be
        // lifted rather than dimmed.
        "border-alpha-400 bg-background-200 dark:bg-gray-100",
        "group-data-[tone=error]/card:border-red-400 group-data-[tone=error]/card:bg-red-100 group-data-[tone=error]/card:dark:bg-red-100",
        className
      )}
    >
      <p className="text-copy-13 text-gray-900">{note}</p>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </footer>
  );
}
