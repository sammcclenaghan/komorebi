import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";

/**
 * A short, factual state: `Active`, `Draft`, `Skipped`, `3 milestones`.
 *
 * Colour is reserved for states where the hue means something — a failure,
 * a warning, completed work. Everything else is grey, which is most
 * things. A badge never labels ordinary metadata (a date, an author, a
 * goal name); that is just text.
 */
const badge = cva(
  cn(
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border",
    "font-medium"
  ),
  {
    variants: {
      tone: {
        gray: "border-alpha-400 bg-background-100 text-gray-900",
        /* Filled. For the one state worth spotting in a list. */
        "gray-solid": "border-transparent bg-gray-1000 text-background-100",
        blue: "border-blue-400 bg-blue-200 text-blue-900",
        amber: "border-amber-400 bg-amber-200 text-amber-900",
        red: "border-red-400 bg-red-200 text-red-900",
        green: "border-green-400 bg-green-200 text-green-900"
      },
      size: {
        sm: "h-5 px-2 text-label-12",
        md: "h-6 px-2.5 text-label-13"
      }
    },
    defaultVariants: { tone: "gray", size: "sm" }
  }
);

type Props = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ tone, size, className, ...rest }: Props) {
  return <span className={cn(badge({ tone, size }), className)} {...rest} />;
}
