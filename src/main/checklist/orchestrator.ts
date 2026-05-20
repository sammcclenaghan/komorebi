import { generateSuggestion } from "../claude/generate";
import { buildContextBlocks } from "../context/registry";
import { getUserId, listConnections } from "../integrations/composio";
import { listActiveGoals } from "../store/goals";
import {
  insertSuggestion,
  listRecentSuggestionsForGoal,
  listSuggestionsForDate
} from "../store/suggestions";
import type { Suggestion } from "~/shared/types";

/** YYYY-MM-DD in the user's local timezone. */
export function localDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ChecklistDay = {
  date: string;
  items: Suggestion[];
  hasGoals: boolean;
};

export async function getTodayChecklist(): Promise<ChecklistDay> {
  const date = localDate();
  const [items, goals] = await Promise.all([
    listSuggestionsForDate(date),
    listActiveGoals()
  ]);
  return { date, items, hasGoals: goals.length > 0 };
}

/**
 * Generate one suggestion for each active goal for today.
 * Skips goals that already have a suggestion today (idempotent).
 * Returns the full checklist for today (including any pre-existing items).
 */
export async function generateTodayChecklist(): Promise<ChecklistDay> {
  const date = localDate();
  const [activeGoals, existing] = await Promise.all([
    listActiveGoals(),
    listSuggestionsForDate(date)
  ]);

  if (activeGoals.length === 0) {
    return { date, items: existing, hasGoals: false };
  }

  const alreadyCovered = new Set(existing.map((s) => s.goalId));
  const goalsToGenerate = activeGoals.filter((g) => !alreadyCovered.has(g.id));

  if (goalsToGenerate.length === 0) {
    return { date, items: existing, hasGoals: true };
  }

  // Context is fetched once per generation pass, shared across goals.
  let contextBlocks: Awaited<ReturnType<typeof buildContextBlocks>> = [];
  try {
    const userId = getUserId();
    const connections = await listConnections(userId);
    contextBlocks = await buildContextBlocks({ userId, connections });
  } catch (err) {
    console.error("[orchestrator] context fetch failed (proceeding without):", err);
  }

  const newSuggestions = await Promise.all(
    goalsToGenerate.map(async (goal) => {
      const history = await listRecentSuggestionsForGoal(goal.id, 14);
      const draft = await generateSuggestion({
        goal,
        history,
        date,
        contextBlocks
      });
      return insertSuggestion({ goalId: goal.id, date, draft });
    })
  );

  return {
    date,
    items: [...existing, ...newSuggestions].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
    hasGoals: true
  };
}
