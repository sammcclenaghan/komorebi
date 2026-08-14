import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "~/lib/cn";

/**
 * On is `gray-1000` — the same ink as body text. A toggle isn't a status
 * light, so it doesn't need a colour; "on" reads from the thumb's position
 * and the filled track.
 */
export function Switch({
  checked,
  disabled,
  onChange,
  label
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <BaseSwitch.Root
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      className={cn(
        "hit-target relative block h-6 w-[42px] shrink-0 rounded-full",
        "border border-transparent bg-gray-500 transition-colors duration-150 ease-out",
        "data-[checked]:bg-gray-1000",
        "data-[disabled]:opacity-50"
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          "absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-background-100 shadow-sm",
          "transition-[translate] duration-150 ease-out data-[checked]:translate-x-[18px]",
          // The page is black in dark mode, so a white thumb is the only one
          // that stays visible against the filled track.
          "dark:bg-white"
        )}
      />
    </BaseSwitch.Root>
  );
}
