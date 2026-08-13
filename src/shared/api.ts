/**
 * The renderer-facing HTTP + SSE API contract.
 */
import type {
  AppSettings,
  ChecklistDay,
  ChecklistStats,
  CoachMemory,
  GenerationProgress,
  Goal,
  GoalPath,
  GoalPriority,
  HistoryDay,
  LinkPreview,
  Reflection,
  Suggestion,
  SuggestionRating,
  SuggestionStatus,
  WeatherSummary,
  WeeklyCheckIn
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

export type GenerationJobView = {
  id: string;
  kind: string;
  targetId: string | null;
  status: "queued" | "running" | "retry_wait" | "succeeded" | "failed";
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  errorKind: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type KomorebiApi = {
  getVersion: () => Promise<string>;
  generation: {
    enqueueChecklist: (input: { requestId: string }) => Promise<GenerationJobView>;
    enqueueChecklistRegeneration: (input: { requestId: string }) => Promise<GenerationJobView>;
    enqueueGoalRetry: (input: {
      requestId: string;
      goalId: string;
    }) => Promise<GenerationJobView>;
    enqueuePathGeneration: (input: {
      requestId: string;
      goalId: string;
    }) => Promise<GenerationJobView>;
    enqueueSuggestionRegeneration: (input: {
      requestId: string;
      suggestionId: string;
      note?: string;
    }) => Promise<GenerationJobView>;
    enqueueSuggestionSkip: (input: {
      requestId: string;
      suggestionId: string;
      reason?: string;
    }) => Promise<GenerationJobView>;
    enqueueCheckInReply: (input: {
      requestId: string;
      content: string;
    }) => Promise<GenerationJobView>;
    recentJobs: (limit?: number) => Promise<GenerationJobView[]>;
  };
  goals: {
    list: () => Promise<Goal[]>;
    add: (input: GoalAddInput) => Promise<Goal>;
    update: (input: GoalUpdateInput) => Promise<Goal>;
    delete: (id: string) => Promise<void>;
  };
  paths: {
    get: (goalId: string) => Promise<GoalPath | null>;
    activate: (input: { pathId: string; expectedRevision: number }) => Promise<GoalPath>;
    completeMilestone: (input: { pathId: string; milestoneId: string; evidence: string; expectedRevision: number }) => Promise<GoalPath>;
  };
  checklist: {
    today: () => Promise<ChecklistDay>;
    /** Completion momentum: current/best streak and totals. */
    stats: () => Promise<ChecklistStats>;
    onProgress: (handler: (event: GenerationProgress) => void) => () => void;
  };
  suggestions: {
    get: (id: string) => Promise<Suggestion | null>;
    setStatus: (input: { id: string; status: SuggestionStatus }) => Promise<Suggestion>;
    setRating: (input: { id: string; rating: SuggestionRating }) => Promise<Suggestion>;
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
    /** This week's persisted coaching conversation. */
    weeklyCheckIn: () => Promise<WeeklyCheckIn>;
  };
  onNavigate: (handler: (view: string) => void) => () => void;
};
