import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";

/**
 * A borderless square for chrome-level actions — close, collapse, a row's
 * overflow menu. Anything a user might hesitate over belongs in `Button`
 * with a visible label instead.
 */
const iconButton = cva(
  cn(
    "pressable-sm inline-flex shrink-0 items-center justify-center rounded-md text-gray-900",
    "hover:bg-alpha-100 hover:text-gray-1000 active:bg-alpha-200",
    "disabled:pointer-events-none disabled:text-gray-700"
  ),
  {
    variants: {
      size: {
        sm: "h-6 w-6",
        md: "h-7 w-7",
        lg: "h-8 w-8"
      }
    },
    defaultVariants: { size: "md" }
  }
);

/**
 * The same shape as `IconButton`, for elements that can't be one — a Base UI
 * trigger, for instance, which renders its own button.
 */
export function iconButtonClasses(size?: "sm" | "md" | "lg", className?: string) {
  return cn(iconButton({ size }), className);
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButton> & {
    /** Icon-only controls always need a name for screen readers. */
    "aria-label": string;
  };

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { size, className, type = "button", ...rest },
  ref
) {
  return (
    <button ref={ref} type={type} className={cn(iconButton({ size }), className)} {...rest} />
  );
});
