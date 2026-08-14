import { cn } from "~/lib/cn";

/** Twelve bars, evenly spaced, offset a tenth of a second apart. */
const BARS = Array.from({ length: 12 }, (_, i) => i);

type Props = {
  /** Edge length in pixels. 16 sits inside a button; 20+ stands alone. */
  size?: number;
  className?: string;
};

/**
 * Geist's spinner: a ring of fading bars rather than a rotating arc. It
 * inherits `currentColor`, so it is always the right colour for whatever
 * it sits inside, and it never looks stalled mid-frame.
 *
 * Purely decorative on its own — the surrounding control owns the busy
 * state (`aria-busy`, or a label that says what is happening).
 */
export function Spinner({ size = 16, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {BARS.map((i) => (
        <span
          key={i}
          className="absolute top-1/2 left-1/2 rounded-full bg-current"
          style={{
            width: "26%",
            height: "8%",
            marginTop: "-4%",
            marginLeft: "-13%",
            transform: `rotate(${i * 30}deg) translateX(140%)`,
            animation: `spinner-bar 1.2s linear ${(i - 12) * 0.1}s infinite`
          }}
        />
      ))}
    </span>
  );
}
