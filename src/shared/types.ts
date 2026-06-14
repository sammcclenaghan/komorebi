export type GoalStatus = "active" | "paused" | "done";

/**
 * How strongly a goal competes for a slot on the daily checklist. Higher
 * priority goals are favored when there are more active goals than the day's
 * target; within a tier, the least-recently-suggested goal wins so lower
 * tiers still surface over time.
 */
export type GoalPriority = "high" | "medium" | "low";

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  context: string | null;
  status: GoalStatus;
  priority: GoalPriority;
  createdAt: string;
  updatedAt: string;
};

export type SuggestionStatus = "pending" | "in_progress" | "done" | "skipped";

export type SuggestionRating = "up" | "down" | null;

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
  rating: SuggestionRating;
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

export type ScheduleSettings = {
  /** When on, the app composes the day's checklist at `time` and notifies. */
  enabled: boolean;
  /** Local time of day, "HH:MM" (24h). */
  time: string;
  /** YYYY-MM-DD of the last scheduled run, so we only fire once per day. */
  lastRunDate: string | null;
};

/** Color theme preference. "system" tracks the OS appearance live. */
export type Theme = "light" | "dark" | "system";

export type AppSettings = {
  schedule: ScheduleSettings;
  theme: Theme;
  /**
   * How many actions to compose per day. Active goals beyond this are rotated
   * in on later days rather than all piled onto today. Keeps a busy day from
   * feeling unwinnable.
   */
  dailyTarget: number;
};
