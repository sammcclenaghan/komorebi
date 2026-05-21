import { randomUUID } from "node:crypto";
import { makeStore } from "./file-store";
import type { Suggestion, SuggestionDraft, SuggestionRating, SuggestionStatus } from "~/shared/types";

const store = makeStore<Suggestion[]>("suggestions.json", () => []);

export type InsertSuggestionInput = {
  goalId: string;
  date: string;
  draft: SuggestionDraft;
};

/** Hydrate any pre-existing rows missing the `rating` field. */
function hydrate(s: Suggestion): Suggestion {
  return { ...s, rating: s.rating ?? null };
}

export async function listAllSuggestions(): Promise<Suggestion[]> {
  const all = await store.load();
  return all.map(hydrate);
}

export async function listSuggestionsForDate(date: string): Promise<Suggestion[]> {
  const all = await store.load();
  return all
    .filter((s) => s.date === date)
    .map(hydrate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listRecentSuggestionsForGoal(
  goalId: string,
  limit: number
): Promise<Suggestion[]> {
  const all = await store.load();
  return all
    .filter((s) => s.goalId === goalId)
    .map(hydrate)
    .sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    )
    .slice(0, limit);
}

export async function getSuggestion(id: string): Promise<Suggestion | null> {
  const all = await store.load();
  const found = all.find((s) => s.id === id);
  return found ? hydrate(found) : null;
}

export async function insertSuggestion(input: InsertSuggestionInput): Promise<Suggestion> {
  return store.mutate((current) => {
    const now = new Date().toISOString();
    const suggestion: Suggestion = {
      id: randomUUID(),
      goalId: input.goalId,
      date: input.date,
      title: input.draft.title,
      summary: input.draft.summary,
      detailMarkdown: input.draft.detailMarkdown,
      resourceUrl: input.draft.resourceUrl,
      estimatedMinutes: input.draft.estimatedMinutes,
      status: "pending",
      rating: null,
      createdAt: now,
      completedAt: null
    };
    return { next: [...current, suggestion], result: suggestion };
  });
}

export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus
): Promise<Suggestion> {
  return store.mutate((current) => {
    const idx = current.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Suggestion not found: ${id}`);
    const existing = hydrate(current[idx]!);
    const next: Suggestion = {
      ...existing,
      status,
      completedAt: status === "done" ? new Date().toISOString() : existing.completedAt
    };
    const nextList = [...current];
    nextList[idx] = next;
    return { next: nextList, result: next };
  });
}

export async function updateSuggestionRating(
  id: string,
  rating: SuggestionRating
): Promise<Suggestion> {
  return store.mutate((current) => {
    const idx = current.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Suggestion not found: ${id}`);
    const existing = hydrate(current[idx]!);
    const next: Suggestion = { ...existing, rating };
    const nextList = [...current];
    nextList[idx] = next;
    return { next: nextList, result: next };
  });
}

/** Returns the IDs of the suggestions that were removed. */
export async function deleteSuggestionsForGoal(goalId: string): Promise<string[]> {
  return store.mutate((current) => {
    const removed = current.filter((s) => s.goalId === goalId).map((s) => s.id);
    return {
      next: current.filter((s) => s.goalId !== goalId),
      result: removed
    };
  });
}
