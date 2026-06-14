import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { makeStore } from "./file-store";
import type { Goal, GoalPriority, GoalStatus } from "~/shared/types";
import type { InValue } from "@libsql/client";

const store = makeStore<Goal[]>("goals.json", () => []);

const VALID_PRIORITIES: ReadonlySet<GoalPriority> = new Set<GoalPriority>([
  "high",
  "medium",
  "low"
]);

function normalizePriority(input: unknown): GoalPriority {
  return typeof input === "string" && VALID_PRIORITIES.has(input as GoalPriority)
    ? (input as GoalPriority)
    : "medium";
}

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    context: row.context as string | null,
    status: row.status as GoalStatus,
    priority: normalizePriority(row.priority),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

export type AddGoalInput = {
  title: string;
  description?: string | null;
  context?: string | null;
  priority?: GoalPriority;
};

export type UpdateGoalInput = Partial<
  Pick<Goal, "title" | "description" | "context" | "status" | "priority">
>;

export async function listGoals(): Promise<Goal[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute("SELECT * FROM goals ORDER BY created_at ASC");
    return rs.rows.map((r) => rowToGoal(r as Record<string, unknown>));
  }
  return store.load();
}

export async function listActiveGoals(): Promise<Goal[]> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC");
    return rs.rows.map((r) => rowToGoal(r as Record<string, unknown>));
  }
  const all = await store.load();
  return all.filter((g) => g.status === "active");
}

export async function getGoal(id: string): Promise<Goal | null> {
  const db = await getDb();
  if (db) {
    const rs = await db.execute({ sql: "SELECT * FROM goals WHERE id = ?", args: [id] });
    if (rs.rows.length === 0) return null;
    return rowToGoal(rs.rows[0] as Record<string, unknown>);
  }
  const all = await store.load();
  return all.find((g) => g.id === id) ?? null;
}

export async function addGoal(input: AddGoalInput): Promise<Goal> {
  const trimmed = input.title.trim();
  if (!trimmed) throw new Error("Goal title is required");

  const priority = normalizePriority(input.priority);

  const db = await getDb();
  if (db) {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      title: trimmed,
      description: input.description?.trim() || null,
      context: input.context?.trim() || null,
      status: "active",
      priority,
      createdAt: now,
      updatedAt: now
    };
    await db.execute({
      sql: "INSERT INTO goals (id, title, description, context, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [goal.id, goal.title, goal.description, goal.context, goal.status, goal.priority, goal.createdAt, goal.updatedAt]
    });
    return goal;
  }

  return store.mutate((current) => {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      title: trimmed,
      description: input.description?.trim() || null,
      context: input.context?.trim() || null,
      status: "active",
      priority,
      createdAt: now,
      updatedAt: now
    };
    return { next: [...current, goal], result: goal };
  });
}

export async function updateGoal(id: string, updates: UpdateGoalInput): Promise<Goal> {
  const db = await getDb();
  if (db) {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const args: InValue[] = [];

    if ("title" in updates && updates.title !== undefined) {
      sets.push("title = ?");
      args.push(updates.title.trim());
    }
    if ("description" in updates) {
      sets.push("description = ?");
      args.push(updates.description?.trim() || null);
    }
    if ("context" in updates) {
      sets.push("context = ?");
      args.push(updates.context?.trim() || null);
    }
    if ("status" in updates && updates.status) {
      sets.push("status = ?");
      args.push(updates.status);
    }
    if ("priority" in updates && updates.priority) {
      sets.push("priority = ?");
      args.push(normalizePriority(updates.priority));
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      args.push(now);
      args.push(id);
      const rs = await db.execute({
        sql: `UPDATE goals SET ${sets.join(", ")} WHERE id = ? RETURNING *`,
        args
      });
      if (rs.rows.length === 0) throw new Error(`Goal not found: ${id}`);
      return rowToGoal(rs.rows[0] as Record<string, unknown>);
    }

    return getGoal(id) as Promise<Goal>;
  }

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
      ...("priority" in updates && updates.priority
        ? { priority: normalizePriority(updates.priority) }
        : {}),
      updatedAt: new Date().toISOString()
    };
    const nextList = [...current];
    nextList[idx] = next;
    return { next: nextList, result: next };
  });
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.execute({ sql: "DELETE FROM goals WHERE id = ?", args: [id] });
    return;
  }

  await store.mutate((current) => ({
    next: current.filter((g) => g.id !== id),
    result: undefined
  }));
}
