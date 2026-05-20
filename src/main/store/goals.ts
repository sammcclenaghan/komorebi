import { randomUUID } from "node:crypto";
import { makeStore } from "./file-store";
import type { Goal, GoalStatus } from "~/shared/types";

const store = makeStore<Goal[]>("goals.json", () => []);

export type AddGoalInput = {
  title: string;
  description?: string | null;
  context?: string | null;
};

export type UpdateGoalInput = Partial<Pick<Goal, "title" | "description" | "context" | "status">>;

export async function listGoals(): Promise<Goal[]> {
  return store.load();
}

export async function listActiveGoals(): Promise<Goal[]> {
  const all = await store.load();
  return all.filter((g) => g.status === "active");
}

export async function getGoal(id: string): Promise<Goal | null> {
  const all = await store.load();
  return all.find((g) => g.id === id) ?? null;
}

export async function addGoal(input: AddGoalInput): Promise<Goal> {
  const trimmed = input.title.trim();
  if (!trimmed) throw new Error("Goal title is required");

  return store.mutate((current) => {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      title: trimmed,
      description: input.description?.trim() || null,
      context: input.context?.trim() || null,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    return { next: [...current, goal], result: goal };
  });
}

export async function updateGoal(id: string, updates: UpdateGoalInput): Promise<Goal> {
  return store.mutate((current) => {
    const idx = current.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error(`Goal not found: ${id}`);
    const existing = current[idx]!;
    const next: Goal = {
      ...existing,
      ...("title" in updates && updates.title !== undefined ? { title: updates.title.trim() } : {}),
      ...("description" in updates ? { description: updates.description?.trim() || null } : {}),
      ...("context" in updates ? { context: updates.context?.trim() || null } : {}),
      ...("status" in updates && updates.status ? { status: updates.status as GoalStatus } : {}),
      updatedAt: new Date().toISOString()
    };
    const nextList = [...current];
    nextList[idx] = next;
    return { next: nextList, result: next };
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await store.mutate((current) => ({
    next: current.filter((g) => g.id !== id),
    result: undefined
  }));
}
