export type GoalStatus = "active" | "paused" | "done";

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  context: string | null;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type SuggestionStatus = "pending" | "in_progress" | "done" | "skipped";

export type Suggestion = {
  id: string;
  goalId: string;
  date: string;
  title: string;
  summary: string;
  detailMarkdown: string;
  resourceUrl: string | null;
  estimatedMinutes: number | null;
  status: SuggestionStatus;
  createdAt: string;
  completedAt: string | null;
};

export type Reflection = {
  id: string;
  suggestionId: string;
  text: string;
  rating: "up" | "down" | null;
  createdAt: string;
};

export type SuggestionDraft = {
  title: string;
  summary: string;
  detailMarkdown: string;
  resourceUrl: string | null;
  estimatedMinutes: number | null;
};
