import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";

/**
 * The one button. Variants cover every button style in the app — if a new
 * button doesn't fit a variant, extend this file rather than hand-rolling
 * classes at the call site.
 */
const button = cva(
  cn(
    "pressable inline-flex items-center justify-center whitespace-nowrap rounded-md",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "bg-[var(--color-ink)] font-medium text-[var(--color-canvas)]",
          "hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]"
        ),
        secondary: cn(
          "border border-[var(--color-rule)] text-[var(--color-ink-2)]",
          "hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]",
          "active:border-[var(--color-rule-2)] active:text-[var(--color-ink)]"
        ),
        ghost: cn(
          "text-[var(--color-ink-2)]",
          "hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] active:bg-[var(--color-panel)]"
        ),
        danger: "bg-[var(--color-danger)] font-medium text-white hover:opacity-90 disabled:opacity-60",
        "danger-outline": cn(
          "border border-[var(--color-danger)]/50 font-medium text-[var(--color-danger)]",
          "hover:bg-[var(--color-danger)]/10 active:bg-[var(--color-danger)]/10"
        )
      },
      size: {
        sm: "gap-1.5 px-3 py-1.5 text-sm",
        md: "gap-1.5 px-3.5 py-2 text-sm",
        lg: "gap-2 px-4 py-2.5 text-base"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size, className, type = "button", ...rest },
  ref
) {
  return (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...rest} />
  );
});
