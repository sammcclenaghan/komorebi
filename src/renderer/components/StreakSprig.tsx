import { useMemo } from "react";
import type { Suggestion } from "~/shared/types";
import type { HistoryDay } from "~/main/checklist/orchestrator";

/**
 * A living streak indicator: a little sprig that grows one leaf per
 * consecutive day the checklist saw at least one completion. Today
 * being incomplete doesn't break the streak (grace until tomorrow) —
 * it only stops the count from advancing.
 */
export function StreakSprig({
  history,
  todayItems,
  todayDate
}: {
  history: HistoryDay[] | undefined;
  todayItems: Suggestion[];
  todayDate: string;
}) {
  const streak = useMemo(
    () => computeStreak(history ?? [], todayItems, todayDate),
    [history, todayItems, todayDate]
  );

  if (streak < 1) return null;

  // Up to 6 leaves alternate sides up the stem; beyond that the number carries it.
  const leafCount = Math.min(streak, 6);
  const leaves = Array.from({ length: leafCount }, (_, i) => i);

  return (
    <div
      className="group relative flex items-center gap-2"
      style={{ animation: "fade-up 420ms ease-out" }}
      title={`${streak}-day streak`}
    >
      <svg viewBox="0 0 24 30" className="h-5 w-4 overflow-visible" aria-hidden>
        {/* stem */}
        <path
          d="M12 29 C 12 22, 11 16, 12 9"
          fill="none"
          stroke="oklch(58% 0.1 145)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {leaves.map((i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const y = 24 - i * 3.4;
          const grown = i === leafCount - 1; // newest leaf gets the unfurl
          return (
            <ellipse
              key={i}
              cx={12 + side * 3.4}
              cy={y}
              rx="3.4"
              ry="1.9"
              transform={`rotate(${side * 32} ${12 + side * 3.4} ${y})`}
              fill="oklch(72% 0.13 142)"
              style={
                grown
                  ? {
                      transformOrigin: "12px 27px",
                      animation: "sprig-grow 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both"
                    }
                  : undefined
              }
            />
          );
        })}
        {/* tip bud */}
        <circle cx="12" cy="8.5" r="1.5" fill="oklch(80% 0.14 110)" />
      </svg>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-3)] tabular-nums">
        {streak}d
      </span>
    </div>
  );
}

/** Date string `n` days before `iso` (local), as YYYY-MM-DD. */
function shiftDate(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function computeStreak(
  history: HistoryDay[],
  todayItems: Suggestion[],
  todayDate: string
): number {
  const doneDates = new Set<string>();
  if (todayItems.some((s) => s.status === "done")) doneDates.add(todayDate);
  for (const day of history) {
    if (day.items.some((s) => s.status === "done")) doneDates.add(day.date);
  }

  // Today incomplete is fine — start counting from yesterday in that case.
  let cursor = doneDates.has(todayDate) ? todayDate : shiftDate(todayDate, 1);
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, 1);
  }
  return streak;
}
