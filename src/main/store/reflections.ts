import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { makeStore } from "./file-store";
import type { Reflection } from "~/shared/types";

const store = makeStore<Reflection[]>("reflections.json", () => []);

function rowToReflection(row: Record<string, unknown>): Reflection {
  return {
    id: row.id as string,
    suggestionId: row.suggestion_id as string,
    text: row.text as string,
    rating: row.rating as "up" | "down" | null,
    createdAt: row.created_at as string
  };
}

export type AddReflectionInput = {
  suggestionId: string;
  text: string;
  rating?: "up" | "down" | null;
};

export async function listReflectionsForSuggestion(
  suggestionId: string
): Promise<Reflection[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute({
      sql: "SELECT * FROM reflections WHERE suggestion_id = ? ORDER BY created_at ASC",
      args: [suggestionId]
    });
    return rs.rows.map((r) => rowToReflection(r as Record<string, unknown>));
  }

  const all = await store.load();
  return all
    .filter((r) => r.suggestionId === suggestionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllReflections(): Promise<Reflection[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute("SELECT * FROM reflections ORDER BY created_at ASC");
    return rs.rows.map((r) => rowToReflection(r as Record<string, unknown>));
  }

  return store.load();
}

export async function addReflection(input: AddReflectionInput): Promise<Reflection> {
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error("Reflection text is required");

  const db = await getDb();
  if (db) {
    const reflection: Reflection = {
      id: randomUUID(),
      suggestionId: input.suggestionId,
      text: trimmed,
      rating: input.rating ?? null,
      createdAt: new Date().toISOString()
    };
    await db.execute({
      sql: "INSERT INTO reflections (id, suggestion_id, text, rating, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [reflection.id, reflection.suggestionId, reflection.text, reflection.rating, reflection.createdAt]
    });
    return reflection;
  }

  return store.mutate((current) => {
    const reflection: Reflection = {
      id: randomUUID(),
      suggestionId: input.suggestionId,
      text: trimmed,
      rating: input.rating ?? null,
      createdAt: new Date().toISOString()
    };
    return { next: [...current, reflection], result: reflection };
  });
}

export async function deleteReflectionsForSuggestions(suggestionIds: string[]): Promise<void> {
  if (suggestionIds.length === 0) return;

  const db = await getDb();
  if (db) {
    const placeholders = suggestionIds.map(() => "?").join(", ");
    await db.execute({
      sql: `DELETE FROM reflections WHERE suggestion_id IN (${placeholders})`,
      args: suggestionIds
    });
    return;
  }

  const ids = new Set(suggestionIds);
  await store.mutate((current) => ({
    next: current.filter((r) => !ids.has(r.suggestionId)),
    result: undefined
  }));
}
