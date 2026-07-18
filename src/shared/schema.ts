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

export const SuggestionSchema = Schema.Struct({
  id: Schema.String,
  goalId: Schema.String,
  /** YYYY-MM-DD (local) of the checklist day this suggestion belongs to. */
  date: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  detailMarkdown: Schema.String,
  resourceUrl: Schema.NullOr(Schema.String),
  estimatedMinutes: Schema.NullOr(Schema.Number),
  status: SuggestionStatusSchema,
  rating: SuggestionRatingSchema,
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
  lastRunDate: Schema.NullOr(Schema.String)
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
  model: Schema.NullOr(Schema.String)
});
export type AppSettings = typeof AppSettingsSchema.Type;

export const defaultSettings: AppSettings = {
  schedule: { enabled: true, time: "07:00", lastRunDate: null },
  theme: "system",
  model: null
};

// ---------------------------------------------------------------------------
// Checklist / history DTOs
// ---------------------------------------------------------------------------

export type ChecklistDay = {
  date: string;
  items: Suggestion[];
  hasGoals: boolean;
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
 * retry affordance wired to `checklist.retryGoal`.
 */
export type GenerationProgress =
  | { phase: "start"; goals: Array<{ id: string; title: string }> }
  | { phase: "context-fetched"; labels: string[] }
  | { phase: "goal-start"; goalId: string }
  | { phase: "goal-status"; goalId: string; label: string }
  | { phase: "goal-done"; goalId: string; suggestion: Suggestion }
  | { phase: "goal-error"; goalId: string; message: string }
  | { phase: "done"; items: Suggestion[] };

// ---------------------------------------------------------------------------
// Integrations DTOs
// ---------------------------------------------------------------------------

export type ToolkitSummary = {
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  categories: string[];
  authSchemes: string[];
  managedAuthSchemes: string[];
  isLocal: boolean;
  noAuth: boolean;
};

export type ConnectionSummary = {
  id: string;
  toolkitSlug: string;
  status: string;
  authConfigId: string | null;
  createdAt: string | null;
};

export type IntegrationStatus = "connected" | "available" | "unsupported";

export type IntegrationView = {
  toolkit: ToolkitSummary;
  status: IntegrationStatus;
  connection: ConnectionSummary | null;
};

export type ConnectStart = {
  connectionId: string;
  redirectUrl: string | null;
};

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
