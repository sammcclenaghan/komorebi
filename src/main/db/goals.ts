import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Goal, GoalStatus } from "~/shared/types";

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  context: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
};

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    context: row.context,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertGoal(
  db: Db,
  input: { title: string; description?: string; context?: string }
): Goal {
  const now = new Date().toISOString();
  const goal: Goal = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? null,
    context: input.context ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  db.prepare(
    `INSERT INTO goals (id, title, description, context, status, created_at, updated_at)
     VALUES (@id, @title, @description, @context, @status, @createdAt, @updatedAt)`
  ).run(goal);

  return goal;
}

export function getGoal(db: Db, id: string): Goal | null {
  const row = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(id) as GoalRow | undefined;
  return row ? rowToGoal(row) : null;
}

export function listActiveGoals(db: Db): Goal[] {
  const rows = db
    .prepare(`SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC`)
    .all() as GoalRow[];
  return rows.map(rowToGoal);
}
