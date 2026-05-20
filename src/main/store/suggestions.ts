import { randomUUID } from "node:crypto";
import { makeStore } from "./file-store";
import type { Suggestion, SuggestionDraft, SuggestionStatus } from "~/shared/types";

const store = makeStore<Suggestion[]>("suggestions.json", () => []);

export type InsertSuggestionInput = {
  goalId: string;
  date: string;
  draft: SuggestionDraft;
};

export async function listAllSuggestions(): Promise<Suggestion[]> {
  return store.load();
}

export async function listSuggestionsForDate(date: string): Promise<Suggestion[]> {
  const all = await store.load();
  return all
    .filter((s) => s.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listRecentSuggestionsForGoal(
  goalId: string,
  limit: number
): Promise<Suggestion[]> {
  const all = await store.load();
  return all
    .filter((s) => s.goalId === goalId)
    .sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    )
    .slice(0, limit);
}

export async function getSuggestion(id: string): Promise<Suggestion | null> {
  const all = await store.load();
  return all.find((s) => s.id === id) ?? null;
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
    const existing = current[idx]!;
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
