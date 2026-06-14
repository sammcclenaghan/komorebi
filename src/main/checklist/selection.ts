import type { Goal, GoalPriority, Suggestion } from "~/shared/types";

const PRIORITY_RANK: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

function priorityRank(priority: GoalPriority | undefined): number {
  return PRIORITY_RANK[priority ?? "medium"] ?? PRIORITY_RANK.medium;
}

/**
 * Choose up to `limit` goals to compose actions for today.
 *
 * Ordering:
 *   1. Higher priority first (high → medium → low).
 *   2. Within a tier, the goal whose last suggestion is oldest (or that has
 *      never been suggested) wins — fair rotation so lower-priority goals
 *      still surface every few days instead of being permanently starved.
 *   3. Finally, older goals first (createdAt) as a stable tiebreaker.
 *
 * This is pure and deterministic given its inputs, so it's easy to unit test.
 */
export function selectGoalsForToday(
  candidates: Goal[],
  allSuggestions: Suggestion[],
  limit: number
): Goal[] {
  if (limit <= 0 || candidates.length === 0) return [];

  // Most recent suggestion date per goal. Absent → never suggested.
  const lastSuggested = new Map<string, string>();
  for (const s of allSuggestions) {
    const prev = lastSuggested.get(s.goalId);
    if (!prev || s.date > prev) lastSuggested.set(s.goalId, s.date);
  }

  const ranked = [...candidates].sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;

    // "" sorts before any real date, so never-suggested goals come first.
    const aLast = lastSuggested.get(a.id) ?? "";
    const bLast = lastSuggested.get(b.id) ?? "";
    if (aLast !== bLast) return aLast.localeCompare(bLast);

    return a.createdAt.localeCompare(b.createdAt);
  });

  return ranked.slice(0, limit);
}
