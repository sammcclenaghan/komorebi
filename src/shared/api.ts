/**
 * The renderer-facing API contract. Both transports implement it:
 *  - Electron: preload bridge over IPC (src/preload/preload.ts)
 *  - Web: HTTP + SSE client (src/renderer/lib/api.ts)
 *
 * The backend implements it once, as a map of Effect handlers
 * (src/main/api/handlers.ts) shared by the IPC registrar and the HTTP router.
 */
import type {
  AppSettings,
  ChecklistDay,
  ChecklistStats,
  CoachMemory,
  GenerationProgress,
  Goal,
  GoalPriority,
  HistoryDay,
  LinkPreview,
  Reflection,
  Suggestion,
  SuggestionRating,
  SuggestionStatus,
  WeatherSummary
} from "./schema";

export type GoalAddInput = {
  title: string;
  description?: string;
  context?: string;
  priority?: GoalPriority;
};

export type GoalUpdateInput = {
  id: string;
  updates: Partial<Pick<Goal, "title" | "description" | "context" | "status" | "priority">>;
};

export type SettingsUpdate = {
  schedule?: Partial<AppSettings["schedule"]>;
  theme?: AppSettings["theme"];
  /** Explicit null resets to the server default model. */
  model?: string | null;
  /** The user's own words about what they want. Explicit null/"" clears it. */
  profile?: string | null;
};

export type KomorebiApi = {
  getVersion: () => Promise<string>;
  goals: {
    list: () => Promise<Goal[]>;
    add: (input: GoalAddInput) => Promise<Goal>;
    update: (input: GoalUpdateInput) => Promise<Goal>;
    delete: (id: string) => Promise<void>;
  };
  checklist: {
    today: () => Promise<ChecklistDay>;
    generate: () => Promise<ChecklistDay>;
    regenerate: () => Promise<ChecklistDay>;
    /**
     * Compose (or re-compose) today's suggestion for a single goal. This is
     * the recovery path for a failed generation: the goal never silently
     * drops off the list — it can always be retried on its own.
     */
    retryGoal: (goalId: string) => Promise<Suggestion>;
    /** Completion momentum: current/best streak and totals. */
    stats: () => Promise<ChecklistStats>;
    onProgress: (handler: (event: GenerationProgress) => void) => () => void;
  };
  suggestions: {
    get: (id: string) => Promise<Suggestion | null>;
    setStatus: (input: { id: string; status: SuggestionStatus }) => Promise<Suggestion>;
    setRating: (input: { id: string; rating: SuggestionRating }) => Promise<Suggestion>;
    /**
     * Mark the suggestion skipped (keeping it in history so future
     * generations learn from it) and compose a replacement.
     */
    skipAndRegenerate: (id: string, reason?: string) => Promise<Suggestion>;
    /**
     * Discard this suggestion entirely and compose a fresh one for the same
     * goal and day. Works from any status — no more dead ends where a task
     * can't be regenerated.
     */
    regenerate: (id: string, note?: string) => Promise<Suggestion>;
  };
  reflections: {
    list: (suggestionId: string) => Promise<Reflection[]>;
    add: (input: {
      suggestionId: string;
      text: string;
      rating?: "up" | "down" | null;
    }) => Promise<Reflection>;
  };
  weather: {
    current: (location: string) => Promise<WeatherSummary | null>;
  };
  links: {
    preview: (url: string) => Promise<LinkPreview>;
  };
  history: {
    list: (daysBack?: number) => Promise<HistoryDay[]>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (update: SettingsUpdate) => Promise<AppSettings>;
  };
  coach: {
    /** The coach's learned notes about the user (null until first distilled). */
    memory: () => Promise<CoachMemory | null>;
  };
  onNavigate: (handler: (view: string) => void) => () => void;
};
