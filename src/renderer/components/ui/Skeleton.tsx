import { cn } from "~/lib/cn";

/**
 * A placeholder shaped like the thing that is loading. Give it the real
 * height of the row or card it stands in for, so the page doesn't jump
 * when the data lands.
 */
export function Skeleton({
  className,
  style
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={cn("skeleton", className)} style={style} />;
}

/** A column of identically-sized placeholders — a list mid-load. */
export function SkeletonList({
  rows = 3,
  height,
  className
}: {
  rows?: number;
  height: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="rounded-xl" style={{ height }} />
      ))}
    </div>
  );
}
