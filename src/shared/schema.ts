/**
 * Domain model, defined once as Effect Schemas.
 *
 * These schemas are the single source of truth for:
 *  - TypeScript types (derived below),
 *  - validating LLM output (SuggestionDraft) before anything touches the DB,
 *  - decoding libsql rows into domain objects (see src/main/repo/*).
 */
import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const GoalStatusSchema = Schema.Literal("active", "paused", "done");
export type GoalStatus = typeof GoalStatusSchema.Type;

/**
 * How strongly a goal competes for a slot on the daily checklist. Higher
 * priority goals are favored; within a tier the least-recently-suggested
 * goal wins so lower tiers still surface over time.
 */
export const GoalPrioritySchema = Schema.Literal("high", "medium", "low");
export type GoalPriority = typeof GoalPrioritySchema.Type;

export const GoalSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  context: Schema.NullOr(Schema.String),
  status: GoalStatusSchema,
  priority: GoalPrioritySchema,
  createdAt: Schema.String,
  updatedAt: Schema.String
});
export type Goal = typeof GoalSchema.Type;

export const PathStatusSchema = Schema.Literal("generating", "draft", "active", "failed", "superseded", "completed");
export const MilestoneStatusSchema = Schema.Literal("pending", "current", "completed", "skipped");
export const PathMilestoneSchema = Schema.Struct({
  id: Schema.String, pathId: Schema.String, position: Schema.Number,
  title: Schema.String, outcome: Schema.String, rationale: Schema.String,
  completionCriteria: Schema.String, status: MilestoneStatusSchema,
  completionEvidence: Schema.NullOr(Schema.String), completedAt: Schema.NullOr(Schema.String)
});
export type PathMilestone = typeof PathMilestoneSchema.Type;
export const PathSourceSchema = Schema.Struct({ id: Schema.String, pathId: Schema.String, title: Schema.String, url: Schema.String, excerpt: Schema.String });
export type PathSource = typeof PathSourceSchema.Type;
export const GoalPathSchema = Schema.Struct({
  id: Schema.String, goalId: Schema.String, version: Schema.Number, status: PathStatusSchema,
  revision: Schema.Number, assumptions: Schema.String, researchSummary: Schema.String,
  researchAt: Schema.NullOr(Schema.String), error: Schema.NullOr(Schema.String),
  createdAt: Schema.String, updatedAt: Schema.String,
  milestones: Schema.Array(PathMilestoneSchema), sources: Schema.Array(PathSourceSchema)
});
export type GoalPath = typeof GoalPathSchema.Type;

const PathText = Schema.String.pipe(Schema.filter((s) => s.trim().length > 0));
export const PathPlanDraftSchema = Schema.Struct({
  assumptions: PathText,
  researchSummary: PathText,
  milestones: Schema.Array(Schema.Struct({ title: PathText, outcome: PathText, rationale: PathText, completionCriteria: PathText }))
}).pipe(Schema.filter((p) => p.milestones.length > 0, { message: () => "at least one milestone is required" }));
export type PathPlanDraft = typeof PathPlanDraftSchema.Type;
export const pathPlanJsonSchema = {
  type: "object",
  properties: {
    assumptions: { type: "string" },
    researchSummary: { type: "string" },
    milestones: {
      type: "array", minItems: 1, maxItems: 12,
      items: {
        type: "object",
        properties: { title: { type: "string" }, outcome: { type: "string" }, rationale: { type: "string" }, completionCriteria: { type: "string" } },
        required: ["title", "outcome", "rationale", "completionCriteria"]
      }
    }
  },
  required: ["assumptions", "researchSummary", "milestones"]
} as const;

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const SuggestionStatusSchema = Schema.Literal(
  "pending",
  "in_progress",
  "done",
  "skipped"
);
export type SuggestionStatus = typeof SuggestionStatusSchema.Type;

export const SuggestionRatingSchema = Schema.NullOr(Schema.Literal("up", "down"));
export type SuggestionRating = typeof SuggestionRatingSchema.Type;

/**
 * Why a composed suggestion is degraded — persisted on the row so the UI can
 * explain, after the fact, why a task has no link. Only the search-related
 * kinds are stored (they're what leaves a task link-less); the fuller set of
 * transient generation notices lives on the progress bus (`GenerationProgress`).
 */
export const GenerationWarningKindSchema = Schema.Literal("search-unavailable", "search-failed");
export type GenerationWarningKind = typeof GenerationWarningKindSchema.Type;

export const SuggestionSchema = Schema.Struct({
  id: Schema.String,
  goalId: Schema.String,
  pathId: Schema.NullOr(Schema.String),
  milestoneId: Schema.NullOr(Schema.String),
  /** YYYY-MM-DD (local) of the checklist day this suggestion belongs to. */
  date: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  detailMarkdown: Schema.String,
  resourceUrl: Schema.NullOr(Schema.String),
  estimatedMinutes: Schema.NullOr(Schema.Number),
  status: SuggestionStatusSchema,
  rating: SuggestionRatingSchema,
  /** Set when the task was composed in a degraded state (e.g. no web search). */
  generationWarning: Schema.NullOr(GenerationWarningKindSchema),
  createdAt: Schema.String,
  completedAt: Schema.NullOr(Schema.String)
});
export type Suggestion = typeof SuggestionSchema.Type;

// ---------------------------------------------------------------------------
// Suggestion drafts (LLM output)
// ---------------------------------------------------------------------------

const TrimmedNonEmpty = Schema.transform(Schema.String, Schema.String, {
  strict: true,
  decode: (s) => s.trim(),
  encode: (s) => s
}).pipe(Schema.filter((s) => s.length > 0, { message: () => "must be a non-empty string" }));

/**
 * Estimated minutes as models actually emit it: a number, a numeric string,
 * null, or absent. Normalized to a rounded positive integer or null.
 */
const MinutesFromModel = Schema.transform(
  Schema.Union(Schema.Number, Schema.String, Schema.Null, Schema.Undefined),
  Schema.NullOr(Schema.Number),
  {
    strict: true,
    decode: (value) => {
      const n = typeof value === "string" ? Number.parseFloat(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
      return Math.round(n);
    },
    encode: (n) => n
  }
);

/** Empty strings and "null"-ish strings from the model become real nulls. */
const UrlFromModel = Schema.transform(
  Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
  Schema.NullOr(Schema.String),
  {
    strict: true,
    decode: (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed || trimmed.toLowerCase() === "null") return null;
      return trimmed;
    },
    encode: (s) => s
  }
);

/**
 * The one shape the composer model must produce. Decoded with tolerance for
 * the ways models bend JSON (numeric strings, empty strings for null), but
 * strict about the fields that matter: a draft without a title, summary and
 * detail is rejected and retried — it never reaches the database.
 */
export const SuggestionDraftSchema = Schema.Struct({
  title: TrimmedNonEmpty,
  summary: TrimmedNonEmpty,
  detailMarkdown: TrimmedNonEmpty,
  resourceUrl: Schema.optional(UrlFromModel),
  estimatedMinutes: Schema.optional(MinutesFromModel)
}).pipe(
  Schema.transform(
    Schema.Struct({
      title: Schema.String,
      summary: Schema.String,
      detailMarkdown: Schema.String,
      resourceUrl: Schema.NullOr(Schema.String),
      estimatedMinutes: Schema.NullOr(Schema.Number)
    }),
    {
      strict: true,
      decode: (d) => ({
        title: d.title,
        summary: d.summary,
        detailMarkdown: d.detailMarkdown,
        resourceUrl: d.resourceUrl ?? null,
        estimatedMinutes: d.estimatedMinutes ?? null
      }),
      encode: (d) => d
    }
  )
);
export type SuggestionDraft = typeof SuggestionDraftSchema.Type;

/**
 * JSON Schema handed to Ollama's structured-output `format` parameter.
 * The server constrains decoding to this grammar, so the model physically
 * cannot emit prose, code fences, or missing keys — the historical source
 * of "generation error" days.
 */
export const suggestionDraftJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    detailMarkdown: { type: "string" },
    resourceUrl: { type: ["string", "null"] },
    estimatedMinutes: { type: ["number", "null"] }
  },
  required: ["title", "summary", "detailMarkdown", "resourceUrl", "estimatedMinutes"]
} as const;

/** Search-query planning output: {"queries": string[]} */
export const SearchQueriesSchema = Schema.Struct({
  queries: Schema.Array(Schema.String)
});
export const searchQueriesJsonSchema = {
  type: "object",
  properties: {
    queries: { type: "array", items: { type: "string" }, maxItems: 3 }
  },
  required: ["queries"]
} as const;

/** Resource-selection output. null is valid when search found nothing suitable. */
export const ResourceSelectionSchema = Schema.Struct({
  selectedUrl: Schema.NullOr(Schema.String),
  reason: Schema.String
});
export type ResourceSelection = typeof ResourceSelectionSchema.Type;
export const resourceSelectionJsonSchema = {
  type: "object",
  properties: {
    selectedUrl: { type: ["string", "null"] },
    reason: { type: "string" }
  },
  required: ["selectedUrl", "reason"]
} as const;

/** Coach-notes distillation output: {"notes": string} */
export const CoachNotesSchema = Schema.Struct({
  notes: Schema.String
});
export const coachNotesJsonSchema = {
  type: "object",
  properties: {
    notes: { type: "string" }
  },
  required: ["notes"]
} as const;

/** Daily coach brief output: {"brief": string} */
export const DayBriefSchema = Schema.Struct({
  brief: TrimmedNonEmpty
});
export const dayBriefJsonSchema = {
  type: "object",
  properties: {
    brief: { type: "string" }
  },
  required: ["brief"]
} as const;

/** Weekly coaching conversation reply: {"reply": string} */
export const CoachReplySchema = Schema.Struct({
  reply: TrimmedNonEmpty
});
export const coachReplyJsonSchema = {
  type: "object",
  properties: {
    reply: { type: "string" }
  },
  required: ["reply"]
} as const;

// ---------------------------------------------------------------------------
// Reflections
// ---------------------------------------------------------------------------

export const ReflectionSchema = Schema.Struct({
  id: Schema.String,
  suggestionId: Schema.String,
  text: Schema.String,
  rating: Schema.NullOr(Schema.Literal("up", "down")),
  createdAt: Schema.String
});
export type Reflection = typeof ReflectionSchema.Type;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const ScheduleSettingsSchema = Schema.Struct({
  /** When on, the app composes the day's checklist at `time` and notifies. */
  enabled: Schema.Boolean,
  /** Local time of day, "HH:MM" (24h). */
  time: Schema.String,
  /** YYYY-MM-DD of the last scheduled run, so we only fire once per day. */
  lastRunDate: Schema.NullOr(Schema.String),
  /**
   * YYYY-MM-DD of the last evening streak-saver nudge, so an at-risk streak
   * is only flagged once per day.
   */
  lastNudgeDate: Schema.NullOr(Schema.String)
});
export type ScheduleSettings = typeof ScheduleSettingsSchema.Type;

/** Color theme preference. "system" tracks the OS appearance live. */
export const ThemeSchema = Schema.Literal("light", "dark", "system");
export type Theme = typeof ThemeSchema.Type;

export const AppSettingsSchema = Schema.Struct({
  schedule: ScheduleSettingsSchema,
  theme: ThemeSchema,
  /**
   * Ollama model tag used to compose suggestions (e.g. "qwen3:32b").
   * null means "use the server default" (the OLLAMA_MODEL env var, or the
   * built-in fallback). An explicit choice here takes precedence over env.
   */
  model: Schema.NullOr(Schema.String),
  /**
   * The user's own words about what they want from their coach — priorities,
   * constraints, taste ("I want to ship a game by December, I only have
   * evenings, I learn best by building"). Injected verbatim into every
   * composition, above everything the model infers.
   */
  profile: Schema.NullOr(Schema.String)
});
export type AppSettings = typeof AppSettingsSchema.Type;

export const defaultSettings: AppSettings = {
  schedule: { enabled: true, time: "07:00", lastRunDate: null, lastNudgeDate: null },
  theme: "system",
  model: null,
  profile: null
};

/**
 * The coach's learned working notes — distilled automatically (at most once
 * a day) from ratings, skip reasons, and reflections, then injected into
 * every composition.
 */
export type CoachMemory = {
  markdown: string;
  /** YYYY-MM-DD the notes were last distilled. */
  updatedDate: string;
};

export const CoachMessageRoleSchema = Schema.Literal("user", "coach");
export type CoachMessageRole = typeof CoachMessageRoleSchema.Type;

export const CoachMessageSchema = Schema.Struct({
  id: Schema.String,
  weekStart: Schema.String,
  role: CoachMessageRoleSchema,
  content: Schema.String,
  createdAt: Schema.String
});
export type CoachMessage = typeof CoachMessageSchema.Type;

/** The current Monday-Sunday coaching conversation. */
export type WeeklyCheckIn = {
  weekStart: string;
  /** True until the user sends their first message for this week. */
  due: boolean;
  messages: CoachMessage[];
};

// ---------------------------------------------------------------------------
// Checklist / history DTOs
// ---------------------------------------------------------------------------

export type ChecklistDay = {
  date: string;
  items: Suggestion[];
  hasGoals: boolean;
  /**
   * The day's coach brief — a short morning note synthesizing the plan,
   * momentum, and conditions. null until a generation pass has composed one
   * (or when the model was unreachable; the checklist itself never blocks
   * on it).
   */
  brief: string | null;
};

/** Completion momentum, computed from the full suggestion history. */
export type ChecklistStats = {
  /**
   * Consecutive days with at least one completed action, counting back from
   * today. An empty today doesn't break the streak until the day is over —
   * it counts from yesterday instead.
   */
  currentStreak: number;
  bestStreak: number;
  totalDone: number;
  doneToday: number;
};

export type HistoryDay = {
  date: string;
  items: Suggestion[];
  reflectionsByItem: Record<string, Reflection[]>;
};

/**
 * Progress events emitted while a generation pass runs. The renderer
 * subscribes (IPC push or SSE) and fills in placeholders as goals complete.
 * A `goal-error` is always recoverable: the goal stays on screen with a
 * retry affordance that enqueues a durable per-goal job.
 */
/**
 * Non-fatal degradations surfaced to the user as transient notices (toasts)
 * while a pass runs — a superset of the persisted {@link GenerationWarningKind}.
 */
export type GenerationNoticeKind =
  | GenerationWarningKind
  | "context-unavailable"
  | "coach-notes-stale"
  | "brief-unavailable";

export type GenerationProgress =
  | { phase: "start"; goals: Array<{ id: string; title: string }> }
  | { phase: "context-fetched"; labels: string[] }
  | { phase: "goal-start"; goalId: string }
  | { phase: "goal-status"; goalId: string; label: string }
  | { phase: "goal-done"; goalId: string; suggestion: Suggestion }
  | { phase: "goal-error"; goalId: string; message: string }
  // A recoverable degradation (search off/failed, context/notes/brief hiccup).
  // The pass continues; the UI shows a toast, not an error.
  | { phase: "warning"; goalId?: string; kind: GenerationNoticeKind; message: string }
  | { phase: "done"; items: Suggestion[] };

// ---------------------------------------------------------------------------
// Weather / link preview DTOs
// ---------------------------------------------------------------------------

export type WeatherCondition =
  | "clear"
  | "clouds"
  | "rain"
  | "drizzle"
  | "snow"
  | "thunderstorm"
  | "mist"
  | "unknown";

export type DailyForecast = {
  condition: WeatherCondition;
  description: string;
  tempMaxC: number;
  tempMinC: number;
  /** Max precipitation probability across the day, 0–100. */
  precipitationProbabilityPct: number;
  /** Total precipitation across the day, mm. */
  precipitationMm: number;
};

export type WeatherSummary = {
  // "Right now" — drives the header icon.
  condition: WeatherCondition;
  description: string;
  temperatureC: number;
  isNight: boolean;
  resolvedName: string;
  // "Today" — feeds the suggestion context provider + the tooltip.
  daily: DailyForecast;
};

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  favicon: string | null;
};
