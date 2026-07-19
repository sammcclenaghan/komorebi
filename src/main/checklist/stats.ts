import type { ChecklistStats, Suggestion } from "~/shared/schema";

/** The YYYY-MM-DD immediately before/after `date` (local-safe arithmetic). */
export function prevDate(date: string): string {
  return shift(date, -1);
}

export function nextDate(date: string): string {
  return shift(date, 1);
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Completion momentum from the full suggestion history. A day "counts" when
 * at least one suggestion was completed on it. An empty today doesn't break
 * the current streak until the day is actually over — it counts back from
 * yesterday instead.
 */
export function computeStats(all: Suggestion[], today: string): ChecklistStats {
  const doneDates = new Set<string>();
  let totalDone = 0;
  let doneToday = 0;

  for (const s of all) {
    if (s.status !== "done") continue;
    totalDone++;
    doneDates.add(s.date);
    if (s.date === today) doneToday++;
  }

  let currentStreak = 0;
  let cursor = doneDates.has(today) ? today : prevDate(today);
  while (doneDates.has(cursor)) {
    currentStreak++;
    cursor = prevDate(cursor);
  }

  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of [...doneDates].sort()) {
    run = prev !== null && date === nextDate(prev) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = date;
  }

  return { currentStreak, bestStreak, totalDone, doneToday };
}
