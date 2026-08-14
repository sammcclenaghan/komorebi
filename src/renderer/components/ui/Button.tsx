import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/cn";
import { Spinner } from "./Spinner";

/**
 * The one button.
 *
 * Geist's shape throughout: fixed heights, a 6px radius, and hierarchy
 * carried by surface rather than colour. Exactly one `primary` per view —
 * everything supporting it is `secondary`, and everything incidental is
 * `tertiary`.
 *
 * If a new button doesn't fit a variant, extend this file. Hand-rolled
 * button classes at a call site are how the last design drifted.
 */
const button = cva(
  cn(
    "pressable relative inline-flex shrink-0 select-none items-center justify-center",
    "whitespace-nowrap rounded-md",
    "disabled:pointer-events-none disabled:border-alpha-400 disabled:bg-gray-100 disabled:text-gray-700"
  ),
  {
    variants: {
      variant: {
        /* The action the view exists for. */
        primary: "bg-gray-1000 text-background-100 hover:bg-gray-900",
        /* Supporting actions. Reads as a control, not as emphasis. */
        secondary: cn(
          "border border-alpha-400 bg-background-100 text-gray-1000",
          "hover:bg-gray-100 active:bg-gray-200"
        ),
        /* Incidental: dismiss, cancel, back. No border, no surface at rest. */
        tertiary: "text-gray-900 hover:bg-alpha-100 hover:text-gray-1000 active:bg-alpha-200",
        /* Compatibility name for existing secondary dismiss actions. */
        ghost: "text-gray-900 hover:bg-alpha-100 hover:text-gray-1000 active:bg-alpha-200",
        /* Destructive confirmation. Pairs 1:1 with a confirm dialog. */
        error: "bg-red-800 text-white hover:bg-red-700",
        /* Opens a destructive confirmation; the deletion itself is `error`. */
        "error-secondary": cn(
          "border border-red-800/40 bg-background-100 text-red-900",
          "hover:border-red-800/60 hover:bg-red-100 active:bg-red-200"
        )
      },
      size: {
        /* Inside a dense row or beside 13px text. */
        xs: "h-6 gap-1 px-2 text-button-12",
        sm: "h-8 gap-1.5 px-2.5 text-button-14",
        md: "h-9 gap-1.5 px-3 text-button-14",
        lg: "h-10 gap-2 px-4 text-button-14"
      },
      /* Icon-only. Square, so the icon sits on the button's optical centre. */
      iconOnly: {
        true: "px-0",
        false: ""
      }
    },
    compoundVariants: [
      { iconOnly: true, size: "xs", class: "w-6" },
      { iconOnly: true, size: "sm", class: "w-8" },
      { iconOnly: true, size: "md", class: "w-9" },
      { iconOnly: true, size: "lg", class: "w-10" }
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      iconOnly: false
    }
  }
);

const SPINNER_SIZE = { xs: 12, sm: 14, md: 14, lg: 16 } as const;

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-busy"> &
  VariantProps<typeof button> & {
    /**
     * Swaps the label for a spinner while keeping the button's width, so a
     * row of controls doesn't reflow mid-action. Also disables the button
     * and announces the busy state.
     */
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size = "md", iconOnly, loading, disabled, className, children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(button({ variant, size, iconOnly }), className)}
      {...rest}
    >
      {/* The label keeps its space while loading, so nothing jumps. */}
      <span
        className={cn(
          "inline-flex items-center justify-center gap-[inherit]",
          loading && "invisible"
        )}
      >
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={SPINNER_SIZE[size ?? "md"]} />
        </span>
      )}
    </button>
  );
});
