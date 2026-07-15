import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";

const iconButton = cva(
  cn(
    "pressable-sm inline-flex items-center justify-center rounded-md text-[var(--color-ink-3)]",
    "hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] active:bg-[var(--color-panel)]",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),
  {
    variants: {
      size: {
        sm: "p-1",
        md: "p-1.5"
      }
    },
    defaultVariants: { size: "md" }
  }
);

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
