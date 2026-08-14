import { forwardRef, useId } from "react";
import { cn } from "~/lib/cn";

/**
 * Label, control, help, error — always in that order, always with the same
 * gaps, and always wired together for assistive tech. `Field` owns the
 * relationship so no form has to reinvent it.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  className,
  children
}: {
  label: React.ReactNode;
  /** What to put in, or how the value is used. Sits under the control. */
  hint?: React.ReactNode;
  /** Replaces the hint while present, so the fix is never below the reason. */
  error?: React.ReactNode;
  optional?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2">
        <span className="text-label-14 font-medium text-gray-1000">{label}</span>
        {optional && <span className="text-label-13 text-gray-700">Optional</span>}
      </label>
      {children}
      {error ? (
        <p className="text-copy-13 text-red-900">{error}</p>
      ) : hint ? (
        <p className="text-copy-13 text-gray-900">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Renders as a monospace field — for hosts, model tags, identifiers. */
  mono?: boolean;
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono, invalid, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn("input h-9 py-0", mono && "font-mono md:text-mono-13", className)}
      {...rest}
    />
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn("input resize-y leading-relaxed", className)}
      {...rest}
    />
  );
});

/**
 * A row of mutually exclusive options, sized like a control rather than a
 * list: theme, priority, anything with three or four short choices. Above
 * that, use a select.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  className
}: {
  value: T;
  options: { value: T; label: string; Icon?: React.ComponentType<{ className?: string }> }[];
  onChange: (next: T) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-alpha-400 bg-gray-100 p-0.5",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "pressable inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-button-14",
              selected
                ? "bg-background-100 text-gray-1000 shadow-sm"
                : "text-gray-900 hover:text-gray-1000"
            )}
          >
            {option.Icon && <option.Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
