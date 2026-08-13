/**
 * The backend implementation of the renderer contract (~/shared/api), as
 * plain async functions over the Effect runtime. The Electron IPC registrar
 * and the HTTP router both call these — one implementation, two transports.
 */
import { Effect } from "effect";
import type {
  GenerationJobView,
  GoalAddInput,
  GoalUpdateInput,
  SettingsUpdate
} from "~/shared/api";
import type {
  AppSettings,
  ChecklistDay,
  ChecklistStats,
  CoachMemory,
  GenerationProgress,
  Goal,
  HistoryDay,
  LinkPreview as LinkPreviewData,
  Reflection,
  Suggestion,
  SuggestionRating,
  SuggestionStatus,
  WeatherSummary,
  WeeklyCheckIn
} from "~/shared/schema";
import { Checklist } from "../checklist/Checklist";
import { Progress, type ProgressListener } from "../checklist/Progress";
import { Db } from "../db/Db";
import { GenerationJobs, type GenerationJob } from "../jobs/GenerationJobs";
import { LinkPreview } from "../links/LinkPreview";
import { GoalsRepo } from "../repo/Goals";
import { MemoryRepo } from "../repo/Memory";
import { ReflectionsRepo } from "../repo/Reflections";
import { SettingsRepo } from "../repo/Settings";
import { SuggestionsRepo } from "../repo/Suggestions";
import { PathsRepo } from "../repo/Paths";
import { Weather } from "../weather/Weather";
import { run } from "../runtime";

function enqueueGeneration(
  kind: string,
  requestId: string,
  payload: Record<string, unknown>
): Promise<GenerationJobView> {
  return run(
    GenerationJobs.pipe(
      Effect.flatMap((jobs) =>
        jobs.enqueue({
          kind,
          idempotencyKey: `${kind}:${requestId}`,
          payload
        })
      ),
      Effect.map(toGenerationJobView)
    )
  );
}

export const handlers = {
  health: {
    ready: (): Promise<void> =>
      run(
        Db.pipe(
          Effect.flatMap((db) => db.execute("SELECT 1")),
          Effect.asVoid
        )
      )
  },
  generation: {
    enqueueChecklist: (requestId: string): Promise<GenerationJobView> =>
      enqueueGeneration("checklist-generate", requestId, {}),
    enqueueChecklistRegeneration: (requestId: string): Promise<GenerationJobView> =>
      enqueueGeneration("checklist-regenerate", requestId, {}),
    enqueueGoalRetry: (requestId: string, goalId: string): Promise<GenerationJobView> =>
      enqueueGeneration("goal-retry", requestId, { goalId }),
    enqueuePathGeneration: (requestId: string, goalId: string): Promise<GenerationJobView> =>
      enqueueGeneration("path-generate", requestId, { goalId }),
    enqueueSuggestionRegeneration: (
      requestId: string,
      suggestionId: string,
      note?: string
    ): Promise<GenerationJobView> =>
      enqueueGeneration("suggestion-regenerate", requestId, { suggestionId, note }),
    enqueueSuggestionSkip: (
      requestId: string,
      suggestionId: string,
      reason?: string
    ): Promise<GenerationJobView> =>
      enqueueGeneration("suggestion-skip-regenerate", requestId, { suggestionId, reason }),
    enqueueCheckInReply: (
      requestId: string,
      content: string
    ): Promise<GenerationJobView> =>
      enqueueGeneration("coach-checkin-reply", requestId, { content }),
    recentJobs: (limit?: number): Promise<GenerationJobView[]> =>
      run(
        GenerationJobs.pipe(
          Effect.flatMap((jobs) => jobs.listRecent(limit)),
          Effect.map((jobs) => jobs.map(toGenerationJobView))
        )
      )
  },
  goals: {
    list: (): Promise<Goal[]> => run(GoalsRepo.pipe(Effect.flatMap((s) => s.list()))),
    add: (input: GoalAddInput): Promise<Goal> =>
      run(GoalsRepo.pipe(Effect.flatMap((s) => s.add(input)))),
    update: (input: GoalUpdateInput): Promise<Goal> =>
      run(GoalsRepo.pipe(Effect.flatMap((s) => s.update(input.id, input.updates)))),
    delete: (id: string): Promise<void> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.deleteGoalCascade(id))))
  },
  paths: {
    get: (goalId: string) => run(PathsRepo.pipe(Effect.flatMap((repo) => repo.getForGoal(goalId)))),
    activate: (input: { pathId: string; expectedRevision: number }) =>
      run(
        PathsRepo.pipe(
          Effect.flatMap((repo) => repo.activate(input.pathId, input.expectedRevision))
        )
      ),
    completeMilestone: (input: {
      pathId: string;
      milestoneId: string;
      evidence: string;
      expectedRevision: number;
    }) =>
      run(
        PathsRepo.pipe(
          Effect.flatMap((repo) =>
            repo.completeMilestone(
              input.pathId,
              input.milestoneId,
              input.evidence,
              input.expectedRevision
            )
          )
        )
      )
  },
  checklist: {
    today: (): Promise<ChecklistDay> => run(Checklist.pipe(Effect.flatMap((s) => s.today()))),
    stats: (): Promise<ChecklistStats> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.stats())))
  },
  suggestions: {
    get: (id: string): Promise<Suggestion | null> =>
      run(SuggestionsRepo.pipe(Effect.flatMap((s) => s.get(id)))),
    setStatus: (input: { id: string; status: SuggestionStatus }): Promise<Suggestion> =>
      run(SuggestionsRepo.pipe(Effect.flatMap((s) => s.setStatus(input.id, input.status)))),
    setRating: (input: { id: string; rating: SuggestionRating }): Promise<Suggestion> =>
      run(SuggestionsRepo.pipe(Effect.flatMap((s) => s.setRating(input.id, input.rating)))),
  },
  reflections: {
    list: (suggestionId: string): Promise<Reflection[]> =>
      run(ReflectionsRepo.pipe(Effect.flatMap((s) => s.listForSuggestion(suggestionId)))),
    add: (input: {
      suggestionId: string;
      text: string;
      rating?: "up" | "down" | null;
    }): Promise<Reflection> => run(ReflectionsRepo.pipe(Effect.flatMap((s) => s.add(input))))
  },
  weather: {
    current: (location: string): Promise<WeatherSummary | null> =>
      run(Weather.pipe(Effect.flatMap((s) => s.current(location))))
  },
  links: {
    preview: (url: string): Promise<LinkPreviewData> =>
      run(LinkPreview.pipe(Effect.flatMap((s) => s.preview(url))))
  },
  history: {
    list: (daysBack?: number): Promise<HistoryDay[]> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.history(daysBack))))
  },
  settings: {
    get: (): Promise<AppSettings> => run(SettingsRepo.pipe(Effect.flatMap((s) => s.get()))),
    update: (update: SettingsUpdate): Promise<AppSettings> =>
      run(SettingsRepo.pipe(Effect.flatMap((s) => s.update(update)))),
    markScheduledRun: (date: string): Promise<void> =>
      run(SettingsRepo.pipe(Effect.flatMap((s) => s.markScheduledRun(date))))
  },
  coach: {
    memory: (): Promise<CoachMemory | null> =>
      run(MemoryRepo.pipe(Effect.flatMap((s) => s.get()))),
    weeklyCheckIn: (): Promise<WeeklyCheckIn> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.weeklyCheckIn())))
  },
  /** Imperative progress subscription for transports (IPC push / SSE). */
  subscribeProgress: (listener: ProgressListener): Promise<() => void> =>
    run(Progress.pipe(Effect.map((s) => s.subscribe(listener))))
} as const;

export type Handlers = typeof handlers;
export type { GenerationProgress };

function toGenerationJobView(job: GenerationJob): GenerationJobView {
  return {
    id: job.id,
    kind: job.kind,
    targetId: generationTargetId(job),
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt,
    errorKind: job.errorKind,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}

function generationTargetId(job: GenerationJob): string | null {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) return null;
  const payload = job.payload as Record<string, unknown>;
  if (typeof payload.goalId === "string") return payload.goalId;
  if (typeof payload.suggestionId === "string") return payload.suggestionId;
  return null;
}
