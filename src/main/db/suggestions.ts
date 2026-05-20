import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Suggestion, SuggestionDraft, SuggestionStatus } from "~/shared/types";

type SuggestionRow = {
  id: string;
  goal_id: string;
  date: string;
  title: string;
  summary: string;
  detail_markdown: string;
  resource_url: string | null;
  estimated_minutes: number | null;
  status: SuggestionStatus;
  created_at: string;
  completed_at: string | null;
};

function rowToSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    goalId: row.goal_id,
    date: row.date,
    title: row.title,
    summary: row.summary,
    detailMarkdown: row.detail_markdown,
    resourceUrl: row.resource_url,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

export function insertSuggestion(
  db: Db,
  input: { goalId: string; date: string; draft: SuggestionDraft }
): Suggestion {
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

  db.prepare(
    `INSERT INTO suggestions
       (id, goal_id, date, title, summary, detail_markdown, resource_url,
        estimated_minutes, status, created_at, completed_at)
     VALUES
       (@id, @goalId, @date, @title, @summary, @detailMarkdown, @resourceUrl,
        @estimatedMinutes, @status, @createdAt, @completedAt)`
  ).run(suggestion);

  return suggestion;
}

export function recentSuggestionsForGoal(
  db: Db,
  goalId: string,
  limit: number
): Suggestion[] {
  const rows = db
    .prepare(
      `SELECT * FROM suggestions
       WHERE goal_id = ?
       ORDER BY date DESC, created_at DESC
       LIMIT ?`
    )
    .all(goalId, limit) as SuggestionRow[];
  return rows.map(rowToSuggestion);
}
