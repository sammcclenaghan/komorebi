import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { makeStore } from "./file-store";
import type { Suggestion, SuggestionDraft, SuggestionRating, SuggestionStatus } from "~/shared/types";

const store = makeStore<Suggestion[]>("suggestions.json", () => []);

function rowToSuggestion(row: Record<string, unknown>): Suggestion {
  return {
    id: row.id as string,
    goalId: row.goal_id as string,
    date: row.date as string,
    title: row.title as string,
    summary: row.summary as string,
    detailMarkdown: row.detail_markdown as string,
    resourceUrl: row.resource_url as string | null,
    estimatedMinutes: row.estimated_minutes as number | null,
    status: row.status as SuggestionStatus,
    rating: row.rating as SuggestionRating,
    createdAt: row.created_at as string,
    completedAt: row.completed_at as string | null
  };
}

export type InsertSuggestionInput = {
  goalId: string;
  date: string;
  draft: SuggestionDraft;
};

export async function listAllSuggestions(): Promise<Suggestion[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute("SELECT * FROM suggestions ORDER BY created_at ASC");
    return rs.rows.map((r) => rowToSuggestion(r as Record<string, unknown>));
  }
  const all = await store.load();
  return all.map(hydrate);
}

export async function listSuggestionsForDate(date: string): Promise<Suggestion[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "SELECT * FROM suggestions WHERE date = ? ORDER BY created_at ASC",
      args: [date]
    });
    return rs.rows.map((r) => rowToSuggestion(r as Record<string, unknown>));
  }
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
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "SELECT * FROM suggestions WHERE goal_id = ? ORDER BY date DESC, created_at DESC LIMIT ?",
      args: [goalId, limit]
    });
    return rs.rows.map((r) => rowToSuggestion(r as Record<string, unknown>));
  }
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
  const db = await getDb();
  if (db) {
    const rs = await db.execute({ sql: "SELECT * FROM suggestions WHERE id = ?", args: [id] });
    if (rs.rows.length === 0) return null;
    return rowToSuggestion(rs.rows[0] as Record<string, unknown>);
  }
  const all = await store.load();
  const found = all.find((s) => s.id === id);
  return found ? hydrate(found) : null;
}

export async function insertSuggestion(input: InsertSuggestionInput): Promise<Suggestion> {
  const db = await getDb();
  if (db) {
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
    await db.execute({
      sql: "INSERT INTO suggestions (id, goal_id, date, title, summary, detail_markdown, resource_url, estimated_minutes, status, rating, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        suggestion.id, suggestion.goalId, suggestion.date, suggestion.title,
        suggestion.summary, suggestion.detailMarkdown, suggestion.resourceUrl,
        suggestion.estimatedMinutes, suggestion.status, suggestion.rating,
        suggestion.createdAt, suggestion.completedAt
      ]
    });
    return suggestion;
  }

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
  const db = await getDb();
  if (db) {
    const completedAt = status === "done" ? new Date().toISOString() : null;
    const rs = await db.execute({
      sql: "UPDATE suggestions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ? RETURNING *",
      args: [status, completedAt, id]
    });
    if (rs.rows.length === 0) throw new Error(`Suggestion not found: ${id}`);
    return rowToSuggestion(rs.rows[0] as Record<string, unknown>);
  }

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
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "UPDATE suggestions SET rating = ? WHERE id = ? RETURNING *",
      args: [rating, id]
    });
    if (rs.rows.length === 0) throw new Error(`Suggestion not found: ${id}`);
    return rowToSuggestion(rs.rows[0] as Record<string, unknown>);
  }

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

/** Delete every suggestion on a given day. Returns the removed IDs. */
export async function deleteSuggestionsForDate(date: string): Promise<string[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "DELETE FROM suggestions WHERE date = ? RETURNING id",
      args: [date]
    });
    return rs.rows.map((r) => (r as Record<string, unknown>).id as string);
  }

  return store.mutate((current) => {
    const removed = current.filter((s) => s.date === date).map((s) => s.id);
    return {
      next: current.filter((s) => s.date !== date),
      result: removed
    };
  });
}

/** Returns the IDs of the suggestions that were removed. */
export async function deleteSuggestionsForGoal(goalId: string): Promise<string[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "DELETE FROM suggestions WHERE goal_id = ? RETURNING id",
      args: [goalId]
    });
    return rs.rows.map((r) => (r as Record<string, unknown>).id as string);
  }

  return store.mutate((current) => {
    const removed = current.filter((s) => s.goalId === goalId).map((s) => s.id);
    return {
      next: current.filter((s) => s.goalId !== goalId),
      result: removed
    };
  });
}

function hydrate(s: Suggestion): Suggestion {
  return { ...s, rating: s.rating ?? null };
}
