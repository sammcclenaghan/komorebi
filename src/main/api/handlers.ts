/**
 * The backend implementation of the renderer contract (~/shared/api), as
 * plain async functions over the Effect runtime. The Electron IPC registrar
 * and the HTTP router both call these — one implementation, two transports.
 */
import { Effect } from "effect";
import type { GoalAddInput, GoalUpdateInput, SettingsUpdate } from "~/shared/api";
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
  WeatherSummary
} from "~/shared/schema";
import { Checklist } from "../checklist/Checklist";
import { Progress, type ProgressListener } from "../checklist/Progress";
import { LinkPreview } from "../links/LinkPreview";
import { GoalsRepo } from "../repo/Goals";
import { MemoryRepo } from "../repo/Memory";
import { ReflectionsRepo } from "../repo/Reflections";
import { SettingsRepo } from "../repo/Settings";
import { SuggestionsRepo } from "../repo/Suggestions";
import { Weather } from "../weather/Weather";
import { run } from "../runtime";

export const handlers = {
  goals: {
    list: (): Promise<Goal[]> => run(GoalsRepo.pipe(Effect.flatMap((s) => s.list()))),
    add: (input: GoalAddInput): Promise<Goal> =>
      run(GoalsRepo.pipe(Effect.flatMap((s) => s.add(input)))),
    update: (input: GoalUpdateInput): Promise<Goal> =>
      run(GoalsRepo.pipe(Effect.flatMap((s) => s.update(input.id, input.updates)))),
    delete: (id: string): Promise<void> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.deleteGoalCascade(id))))
  },
  checklist: {
    today: (): Promise<ChecklistDay> => run(Checklist.pipe(Effect.flatMap((s) => s.today()))),
    generate: (): Promise<ChecklistDay> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.generate()))),
    regenerate: (): Promise<ChecklistDay> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.regenerateDay()))),
    retryGoal: (goalId: string): Promise<Suggestion> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.retryGoal(goalId)))),
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
    skipAndRegenerate: (id: string, reason?: string): Promise<Suggestion> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.skipAndRegenerate(id, reason)))),
    regenerate: (id: string, note?: string): Promise<Suggestion> =>
      run(Checklist.pipe(Effect.flatMap((s) => s.regenerateSuggestion(id, note))))
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
      run(MemoryRepo.pipe(Effect.flatMap((s) => s.get())))
  },
  /** Imperative progress subscription for transports (IPC push / SSE). */
  subscribeProgress: (listener: ProgressListener): Promise<() => void> =>
    run(Progress.pipe(Effect.map((s) => s.subscribe(listener))))
} as const;

export type Handlers = typeof handlers;
export type { GenerationProgress };
