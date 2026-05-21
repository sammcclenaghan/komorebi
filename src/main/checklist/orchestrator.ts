import { BrowserWindow } from "electron";
import { generateSuggestion, type HistoryItem } from "../claude/generate";
import { buildContextBlocks } from "../context/registry";
import { getUserId, listConnections } from "../integrations/composio";
import { deleteGoal, getGoal, listActiveGoals } from "../store/goals";
import {
  deleteReflectionsForSuggestions,
  listAllReflections,
  listReflectionsForSuggestion
} from "../store/reflections";
import {
  deleteSuggestionsForGoal,
  getSuggestion,
  insertSuggestion,
  listAllSuggestions,
  listRecentSuggestionsForGoal,
  listSuggestionsForDate,
  updateSuggestionStatus
} from "../store/suggestions";
import type { Reflection, Suggestion } from "~/shared/types";

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

export type GenerationProgress =
  | { phase: "start"; goals: Array<{ id: string; title: string }> }
  | { phase: "context-fetched"; labels: string[] }
  | { phase: "goal-start"; goalId: string }
  | { phase: "goal-done"; goalId: string; suggestion: Suggestion }
  | { phase: "goal-error"; goalId: string; message: string }
  | { phase: "done"; items: Suggestion[] };

const CHANNEL = "checklist:progress";

function emitProgress(payload: GenerationProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(CHANNEL, payload);
  }
}

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
 * Emits progress events the renderer can subscribe to so the UI can
 * fill in placeholders as each goal completes.
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

  const alreadyCovered = new Set(
    existing.filter((s) => s.status !== "skipped").map((s) => s.goalId)
  );
  const goalsToGenerate = activeGoals.filter((g) => !alreadyCovered.has(g.id));

  if (goalsToGenerate.length === 0) {
    return { date, items: existing, hasGoals: true };
  }

  emitProgress({
    phase: "start",
    goals: goalsToGenerate.map((g) => ({ id: g.id, title: g.title }))
  });

  let contextBlocks: Awaited<ReturnType<typeof buildContextBlocks>> = [];
  try {
    const userId = getUserId();
    const connections = await listConnections(userId);
    contextBlocks = await buildContextBlocks({ userId, connections });
  } catch (err) {
    console.error("[orchestrator] context fetch failed (proceeding without):", err);
  }
  emitProgress({
    phase: "context-fetched",
    labels: contextBlocks.map((b) => b.label)
  });

  const newSuggestions = await Promise.all(
    goalsToGenerate.map(async (goal) => {
      emitProgress({ phase: "goal-start", goalId: goal.id });
      try {
        const recent = await listRecentSuggestionsForGoal(goal.id, 14);
        const history: HistoryItem[] = await Promise.all(
          recent.map(async (s) => ({
            suggestion: s,
            reflections: await listReflectionsForSuggestion(s.id)
          }))
        );
        const draft = await generateSuggestion({
          goal,
          history,
          date,
          contextBlocks
        });
        const inserted = await insertSuggestion({ goalId: goal.id, date, draft });
        emitProgress({ phase: "goal-done", goalId: goal.id, suggestion: inserted });
        return inserted;
      } catch (err) {
        const message = (err as Error).message ?? "Unknown error";
        emitProgress({ phase: "goal-error", goalId: goal.id, message });
        throw err;
      }
    })
  );

  const items = [...existing, ...newSuggestions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  emitProgress({ phase: "done", items });

  return { date, items, hasGoals: true };
}

export type HistoryDay = {
  date: string;
  items: Suggestion[];
  reflectionsByItem: Record<string, Reflection[]>;
};

/**
 * Past days, newest first, with each day's suggestions and the
 * reflections attached to each one. Excludes today (which has its
 * own tab). Capped at `daysBack`.
 */
export async function getHistory(daysBack: number = 30): Promise<HistoryDay[]> {
  const today = localDate();
  const [allSuggestions, allReflections] = await Promise.all([
    listAllSuggestions(),
    listAllReflections()
  ]);

  const byDate = new Map<string, Suggestion[]>();
  for (const s of allSuggestions) {
    if (s.date >= today) continue;
    const bucket = byDate.get(s.date) ?? [];
    bucket.push(s);
    byDate.set(s.date, bucket);
  }

  const reflectionsBySuggestion = new Map<string, Reflection[]>();
  for (const r of allReflections) {
    const bucket = reflectionsBySuggestion.get(r.suggestionId) ?? [];
    bucket.push(r);
    reflectionsBySuggestion.set(r.suggestionId, bucket);
  }

  const dates = [...byDate.keys()].sort().reverse().slice(0, daysBack);

  return dates.map((date) => {
    const items = (byDate.get(date) ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    const reflectionsByItem: Record<string, Reflection[]> = {};
    for (const item of items) {
      const refs = (reflectionsBySuggestion.get(item.id) ?? []).slice().sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      if (refs.length > 0) reflectionsByItem[item.id] = refs;
    }
    return { date, items, reflectionsByItem };
  });
}

/**
 * Delete a goal and everything it owns (suggestions + their reflections).
 * Order matters: collect IDs first, then delete leaves before the trunk.
 */
export async function deleteGoalCascade(goalId: string): Promise<void> {
  const removedSuggestionIds = await deleteSuggestionsForGoal(goalId);
  await deleteReflectionsForSuggestions(removedSuggestionIds);
  await deleteGoal(goalId);
}

/**
 * Mark a suggestion as skipped, then generate a fresh suggestion for the same
 * goal using current history + context. Returns the new suggestion.
 */
export async function skipAndRegenerate(suggestionId: string): Promise<Suggestion> {
  const original = await getSuggestion(suggestionId);
  if (!original) throw new Error(`Suggestion not found: ${suggestionId}`);

  await updateSuggestionStatus(suggestionId, "skipped");

  const goal = await getGoal(original.goalId);
  if (!goal) throw new Error(`Goal not found: ${original.goalId}`);

  emitProgress({
    phase: "start",
    goals: [{ id: goal.id, title: goal.title }]
  });

  let contextBlocks: Awaited<ReturnType<typeof buildContextBlocks>> = [];
  try {
    const userId = getUserId();
    const connections = await listConnections(userId);
    contextBlocks = await buildContextBlocks({ userId, connections });
  } catch (err) {
    console.error("[orchestrator] context fetch failed (proceeding without):", err);
  }
  emitProgress({ phase: "context-fetched", labels: contextBlocks.map((b) => b.label) });

  emitProgress({ phase: "goal-start", goalId: goal.id });
  try {
    const recent = await listRecentSuggestionsForGoal(goal.id, 14);
    const history: HistoryItem[] = await Promise.all(
      recent.map(async (s) => ({
        suggestion: s,
        reflections: await listReflectionsForSuggestion(s.id)
      }))
    );

    const date = localDate();
    const draft = await generateSuggestion({ goal, history, date, contextBlocks });
    const inserted = await insertSuggestion({ goalId: goal.id, date, draft });
    emitProgress({ phase: "goal-done", goalId: goal.id, suggestion: inserted });
    emitProgress({ phase: "done", items: [inserted] });
    return inserted;
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    emitProgress({ phase: "goal-error", goalId: goal.id, message });
    throw err;
  }
}
