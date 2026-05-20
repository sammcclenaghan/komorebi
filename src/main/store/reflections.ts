import { randomUUID } from "node:crypto";
import { makeStore } from "./file-store";
import type { Reflection } from "~/shared/types";

const store = makeStore<Reflection[]>("reflections.json", () => []);

export type AddReflectionInput = {
  suggestionId: string;
  text: string;
  rating?: "up" | "down" | null;
};

export async function listReflectionsForSuggestion(
  suggestionId: string
): Promise<Reflection[]> {
  const all = await store.load();
  return all
    .filter((r) => r.suggestionId === suggestionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addReflection(input: AddReflectionInput): Promise<Reflection> {
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error("Reflection text is required");

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
