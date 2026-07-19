/**
 * The checklist orchestrator: turns active goals into today's suggestions.
 *
 * Guarantees the old implementation only half-delivered:
 *  - Generation passes are serialized behind a semaphore and re-check
 *    coverage after acquiring it, so the scheduler and the Today page's
 *    auto-fire can race without ever double-inserting.
 *  - Each goal composes in its own fiber; one failure never discards the
 *    other goals' suggestions.
 *  - A failed goal is never dropped: `retryGoal` re-composes exactly one
 *    goal, and `regenerateSuggestion` replaces any existing suggestion in
 *    place — there is no state a task can get stuck in.
 */
import { Effect } from "effect";
import type {
  ChecklistDay,
  ChecklistStats,
  GenerationNoticeKind,
  GenerationProgress,
  GenerationWarningKind,
  Goal,
  HistoryDay,
  Reflection,
  Suggestion
} from "~/shared/schema";
import { Composer, type HistoryItem } from "../llm/Composer";
import { Context } from "../context/Context";
import { BriefsRepo } from "../repo/Briefs";
import { MemoryRepo } from "../repo/Memory";
import { GoalsRepo, GoalNotFoundError } from "../repo/Goals";
import { ReflectionsRepo } from "../repo/Reflections";
import { SettingsRepo } from "../repo/Settings";
import { SuggestionsRepo, SuggestionNotFoundError } from "../repo/Suggestions";
import { Progress } from "./Progress";
import { selectGoalsForToday } from "./selection";
import { computeStats, prevDate } from "./stats";
import type { ContextBlock } from "../context/types";

/** YYYY-MM-DD in the user's local timezone. */
export function localDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** How many goals compose concurrently within one generation pass. */
const GOAL_CONCURRENCY = 3;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return String(err);
}

export class Checklist extends Effect.Service<Checklist>()("Checklist", {
  dependencies: [
    GoalsRepo.Default,
    SuggestionsRepo.Default,
    ReflectionsRepo.Default,
    SettingsRepo.Default,
    BriefsRepo.Default,
    MemoryRepo.Default,
    Composer.Default,
    Context.Default,
    Progress.Default
  ],
  effect: Effect.gen(function* () {
    const goals = yield* GoalsRepo;
    const suggestions = yield* SuggestionsRepo;
    const reflections = yield* ReflectionsRepo;
    const settings = yield* SettingsRepo;
    const briefs = yield* BriefsRepo;
    const memory = yield* MemoryRepo;
    const composer = yield* Composer;
    const context = yield* Context;
    const progress = yield* Progress;

    // Serializes generation passes. Combined with the coverage re-check at
    // the top of each pass this makes generation idempotent under races
    // (scheduler + renderer auto-fire on first launch).
    const generationLock = yield* Effect.makeSemaphore(1);

    const emit = (event: GenerationProgress) => progress.emit(event);

    /** Best-effort context assembly — never fails a generation. */
    const fetchContext = context.build().pipe(
      Effect.catchAll((err) =>
        Effect.logWarning(`context fetch failed (proceeding without): ${errorMessage(err)}`).pipe(
          Effect.zipRight(
            emit({
              phase: "warning",
              kind: "context-unavailable",
              message: "Couldn't load today's context (weather, calendar); composing without it."
            })
          ),
          Effect.as([] as ContextBlock[])
        )
      )
    );

    /**
     * Everything the coach knows going into a composition pass: the model
     * choice, the user's own words (profile), the learned notes (re-distilled
     * from recent feedback at most once a day), and completion momentum.
     */
    const prepareCoach = Effect.gen(function* () {
      const current = yield* settings.get();
      const all = yield* suggestions.listAll();
      const today = localDate();
      const stats = computeStats(all, today);
      const notes = yield* refreshNotes(current.model, all, today);
      return { model: current.model, profile: current.profile, notes, stats };
    });

    type CoachInputs = Effect.Effect.Success<typeof prepareCoach>;

    /**
     * Re-distill the coach's working notes when they're stale (not yet
     * updated today) and there's actual feedback to learn from. Any failure
     * falls back to the existing notes — learning is never in the critical
     * path of getting tasks on screen.
     */
    const refreshNotes = (
      model: string | null,
      all: Suggestion[],
      today: string
    ): Effect.Effect<string | null> =>
      Effect.gen(function* () {
        const existing = yield* memory.get();
        if (existing && existing.updatedDate === today) {
          return existing.markdown || null;
        }

        const refs = yield* reflections.listAll();
        const bySuggestion = new Map<string, Reflection[]>();
        for (const r of refs) {
          const bucket = bySuggestion.get(r.suggestionId) ?? [];
          bucket.push(r);
          bySuggestion.set(r.suggestionId, bucket);
        }

        // Evidence = recent suggestions carrying any signal: a rating, a
        // completion/skip, or the user's own notes. Pending rows teach nothing.
        const evidence: HistoryItem[] = [...all]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((s) => ({ suggestion: s, reflections: bySuggestion.get(s.id) ?? [] }))
          .filter(
            (h) =>
              h.suggestion.rating !== null ||
              h.suggestion.status === "done" ||
              h.suggestion.status === "skipped" ||
              h.reflections.length > 0
          )
          .slice(0, 30);

        if (evidence.length === 0) return existing?.markdown || null;

        const notes = yield* composer.distillNotes({
          existingNotes: existing?.markdown ?? null,
          evidence,
          model: model ?? undefined
        });
        yield* memory.set(notes, today);
        return notes || null;
      }).pipe(
        Effect.catchAll((err) =>
          Effect.logWarning(`coach notes refresh failed (using previous): ${errorMessage(err)}`).pipe(
            Effect.zipRight(
              emit({
                phase: "warning",
                kind: "coach-notes-stale",
                message: "Couldn't refresh coach notes; using the previous ones."
              })
            ),
            Effect.zipRight(memory.get().pipe(Effect.catchAll(() => Effect.succeed(null)))),
            Effect.map((m) => m?.markdown || null)
          )
        )
      );

    /** Compose one goal's suggestion and insert it, emitting progress. */
    const composeGoal = (
      date: string,
      goal: Goal,
      contextBlocks: ContextBlock[],
      coach: CoachInputs,
      extraNote?: string
    ) =>
      Effect.gen(function* () {
        yield* emit({ phase: "goal-start", goalId: goal.id });

        const recent = yield* suggestions.listRecentForGoal(goal.id, 14);
        const history: HistoryItem[] = yield* Effect.forEach(
          recent,
          (s) =>
            reflections
              .listForSuggestion(s.id)
              .pipe(Effect.map((refs) => ({ suggestion: s, reflections: refs }))),
          { concurrency: 4 }
        );

        const statusCallback = (label: string) => {
          // Fire-and-forget: status labels are cosmetic.
          Effect.runSync(emit({ phase: "goal-status", goalId: goal.id, label }));
        };

        // Capture a search degradation so it persists on the row (drives the
        // "no link" badge). A runtime search *failure* is also surfaced as a
        // transient toast; a missing provider is a steady config state, so it
        // gets the badge but no interruptive notice every single task.
        let searchWarning: GenerationWarningKind | null = null;
        const warningCallback = (kind: GenerationNoticeKind, message: string) => {
          if (kind === "search-unavailable" || kind === "search-failed") {
            searchWarning = kind;
          }
          if (kind === "search-failed") {
            Effect.runSync(emit({ phase: "warning", goalId: goal.id, kind, message }));
          }
        };

        const draft = yield* composer.compose({
          goal,
          history,
          date,
          contextBlocks,
          model: coach.model ?? undefined,
          profile: coach.profile,
          coachNotes: coach.notes,
          stats: coach.stats,
          extraNote,
          onStatus: statusCallback,
          onWarning: warningCallback
        });

        const inserted = yield* suggestions.insert({
          goalId: goal.id,
          date,
          draft,
          warning: searchWarning
        });
        yield* emit({ phase: "goal-done", goalId: goal.id, suggestion: inserted });
        return inserted;
      }).pipe(
        Effect.tapError((err) =>
          emit({ phase: "goal-error", goalId: goal.id, message: errorMessage(err) })
        )
      );

    /**
     * Compose a fresh suggestion for each goal, fetching context once.
     * Per-goal isolation: each goal succeeds or fails on its own. Partial
     * failure returns the successes (the per-goal "goal-error" events carry
     * the details); only a total wipeout fails the pass.
     */
    /**
     * Compose the morning coach note from what actually landed today.
     * Strictly best-effort: any failure logs and yields no brief — it can
     * never fail (or delay-fail) the checklist itself.
     */
    const composeDayBrief = (
      date: string,
      items: Suggestion[],
      contextBlocks: ContextBlock[]
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (items.length === 0) return;
        const { model, profile } = yield* settings.get();
        const all = yield* suggestions.listAll();
        const yesterday = all.filter((s) => s.date === prevDate(date));
        const brief = yield* composer.composeBrief({
          date,
          today: items,
          yesterday,
          stats: computeStats(all, date),
          contextBlocks,
          profile,
          model: model ?? undefined
        });
        yield* briefs.upsert(date, brief);
      }).pipe(
        Effect.catchAll((err) =>
          Effect.logWarning(`brief composition failed (skipping): ${errorMessage(err)}`).pipe(
            Effect.zipRight(
              emit({
                phase: "warning",
                kind: "brief-unavailable",
                message: "Couldn't write today's brief."
              })
            )
          )
        )
      );

    const composeForGoals = (date: string, toGenerate: Goal[]) =>
      Effect.gen(function* () {
        if (toGenerate.length === 0) {
          return { fresh: [] as Suggestion[], contextBlocks: [] as ContextBlock[] };
        }

        yield* emit({
          phase: "start",
          goals: toGenerate.map((g) => ({ id: g.id, title: g.title }))
        });

        // Coach prep (incl. the once-a-day notes distillation) runs alongside
        // the context fetch — placeholders are already on screen.
        const [coach, contextBlocks] = yield* Effect.all([prepareCoach, fetchContext], {
          concurrency: 2
        });
        yield* emit({
          phase: "context-fetched",
          labels: contextBlocks.map((b) => b.label)
        });

        const results = yield* Effect.forEach(
          toGenerate,
          (goal) => Effect.either(composeGoal(date, goal, contextBlocks, coach)),
          { concurrency: GOAL_CONCURRENCY }
        );

        const succeeded = results
          .filter((r): r is Extract<typeof r, { _tag: "Right" }> => r._tag === "Right")
          .map((r) => r.right);

        if (succeeded.length === 0 && results.length > 0) {
          const first = results.find((r) => r._tag === "Left");
          if (first && first._tag === "Left") {
            return yield* Effect.fail(first.left);
          }
        }

        return { fresh: succeeded, contextBlocks };
      });

    /** Single-goal compose used by retry / skip / regenerate flows. */
    const composeOne = (goal: Goal, extraNote?: string) =>
      Effect.gen(function* () {
        const date = localDate();

        yield* emit({ phase: "start", goals: [{ id: goal.id, title: goal.title }] });
        const [coach, contextBlocks] = yield* Effect.all([prepareCoach, fetchContext], {
          concurrency: 2
        });
        yield* emit({ phase: "context-fetched", labels: contextBlocks.map((b) => b.label) });

        const inserted = yield* composeGoal(date, goal, contextBlocks, coach, extraNote).pipe(
          Effect.tapError(() => emit({ phase: "done", items: [] }))
        );
        yield* emit({ phase: "done", items: [inserted] });
        return inserted;
      });

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    const today = () =>
      Effect.gen(function* () {
        const date = localDate();
        const [items, activeGoals, brief] = yield* Effect.all(
          [suggestions.listForDate(date), goals.listActive(), briefs.get(date)],
          { concurrency: 3 }
        );
        return { date, items, hasGoals: activeGoals.length > 0, brief } satisfies ChecklistDay;
      });

    const stats = (): Effect.Effect<ChecklistStats, never> =>
      suggestions.listAll().pipe(
        Effect.map((all) => computeStats(all, localDate())),
        Effect.catchAll(() =>
          Effect.succeed({ currentStreak: 0, bestStreak: 0, totalDone: 0, doneToday: 0 })
        )
      );

    /**
     * Generate one suggestion for each active goal that doesn't have one
     * today (idempotent). Progress events let the UI fill placeholders as
     * goals complete.
     */
    const generate = () =>
      generationLock.withPermits(1)(
        Effect.gen(function* () {
          const date = localDate();
          const [activeGoals, existing] = yield* Effect.all(
            [goals.listActive(), suggestions.listForDate(date)],
            { concurrency: 2 }
          );

          if (activeGoals.length === 0) {
            return {
              date,
              items: existing,
              hasGoals: false,
              brief: yield* briefs.get(date)
            } satisfies ChecklistDay;
          }

          const alreadyCovered = new Set(
            existing.filter((s) => s.status !== "skipped").map((s) => s.goalId)
          );

          // Compose one action for every active goal that isn't already on
          // today's list — no cap. Ordering is highest-priority and
          // least-recently-suggested first.
          const candidates = activeGoals.filter((g) => !alreadyCovered.has(g.id));
          const allSuggestions = yield* suggestions.listAll();
          const toGenerate = selectGoalsForToday(candidates, allSuggestions, candidates.length);

          if (toGenerate.length === 0) {
            return {
              date,
              items: existing,
              hasGoals: true,
              brief: yield* briefs.get(date)
            } satisfies ChecklistDay;
          }

          const { fresh, contextBlocks } = yield* composeForGoals(date, toGenerate).pipe(
            // Progress listeners key off "done" to unstick the UI, so emit it
            // with whatever already exists before surfacing a total failure.
            Effect.tapError(() => emit({ phase: "done", items: existing }))
          );

          const items = [...existing, ...fresh].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
          );

          // Fresh tasks landed — write today's coach note before signaling
          // completion (the rows are already on screen via goal-done events).
          if (fresh.length > 0) {
            yield* composeDayBrief(date, items, contextBlocks);
          }
          yield* emit({ phase: "done", items });

          return {
            date,
            items,
            hasGoals: true,
            brief: yield* briefs.get(date)
          } satisfies ChecklistDay;
        })
      );

    /**
     * Throw away today's composed list and compose a fresh action for every
     * active goal. Deletes today's suggestions (and their reflections) so
     * the day starts clean rather than stacking skipped rows on top.
     */
    const regenerateDay = () =>
      generationLock.withPermits(1)(
        Effect.gen(function* () {
          const date = localDate();
          const activeGoals = yield* goals.listActive();
          if (activeGoals.length === 0) {
            return { date, items: [], hasGoals: false, brief: null } satisfies ChecklistDay;
          }

          const removedIds = yield* suggestions.removeForDate(date);
          yield* reflections.removeForSuggestions(removedIds);
          yield* briefs.remove(date);

          const allSuggestions = yield* suggestions.listAll();
          const toGenerate = selectGoalsForToday(activeGoals, allSuggestions, activeGoals.length);

          const { fresh, contextBlocks } = yield* composeForGoals(date, toGenerate).pipe(
            Effect.tapError(() => emit({ phase: "done", items: [] }))
          );

          const items = [...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (fresh.length > 0) {
            yield* composeDayBrief(date, items, contextBlocks);
          }
          yield* emit({ phase: "done", items });

          return {
            date,
            items,
            hasGoals: true,
            brief: yield* briefs.get(date)
          } satisfies ChecklistDay;
        })
      );

    /**
     * Compose (or re-compose) today's suggestion for one goal. The recovery
     * path for a per-goal generation failure. Idempotent: if the goal is
     * already covered today, its existing suggestion is returned untouched.
     */
    const retryGoal = (goalId: string) =>
      generationLock.withPermits(1)(
        Effect.gen(function* () {
          const goal = yield* goals.getOrFail(goalId);
          const date = localDate();
          const existing = (yield* suggestions.listForDate(date)).find(
            (s) => s.goalId === goalId && s.status !== "skipped"
          );
          if (existing) return existing;
          return yield* composeOne(goal);
        })
      );

    /**
     * Mark a suggestion as skipped, then generate a fresh suggestion for the
     * same goal. The skip reason is stored as a reflection on the skipped
     * suggestion: the composer prompt reads reflections as top-priority
     * "Note:" lines, so the reason steers the replacement AND future days.
     */
    const skipAndRegenerate = (suggestionId: string, reason?: string) =>
      generationLock.withPermits(1)(
        Effect.gen(function* () {
          const original = yield* suggestions.getOrFail(suggestionId);
          yield* suggestions.setStatus(suggestionId, "skipped");

          const trimmed = reason?.trim();
          if (trimmed) {
            yield* reflections.add({ suggestionId, text: trimmed });
          }

          const goal = yield* goals.getOrFail(original.goalId);
          return yield* composeOne(goal);
        })
      );

    /**
     * Discard a suggestion entirely and compose a fresh one for the same
     * goal and day. Unlike skip, nothing is kept — this is "that's not it,
     * try again". Works from any status, so a task can always be redone.
     */
    const regenerateSuggestion = (suggestionId: string, note?: string) =>
      generationLock.withPermits(1)(
        Effect.gen(function* () {
          const original = yield* suggestions.getOrFail(suggestionId);
          const goal = yield* goals.getOrFail(original.goalId);

          yield* suggestions.remove(suggestionId);
          yield* reflections.removeForSuggestions([suggestionId]);

          return yield* composeOne(goal, note);
        })
      );

    /**
     * Past days, newest first, with each day's suggestions and reflections.
     * Excludes today (which has its own tab). Capped at `daysBack`.
     */
    const history = (daysBack: number = 30) =>
      Effect.gen(function* () {
        const todayDate = localDate();
        const [allSuggestions, allReflections] = yield* Effect.all(
          [suggestions.listAll(), reflections.listAll()],
          { concurrency: 2 }
        );

        const byDate = new Map<string, Suggestion[]>();
        for (const s of allSuggestions) {
          if (s.date >= todayDate) continue;
          const bucket = byDate.get(s.date) ?? [];
          bucket.push(s);
          byDate.set(s.date, bucket);
        }

        const reflectionsBySuggestion = new Map<string, Reflection[]>();
        for (const r of allReflections) {
          const bucket = reflectionsBySuggestion.get(r.suggestionId) ?? [];
          bucket.push(r);
          reflectionsBySuggestion.set(r.suggestionId, bucket);
        }

        const dates = [...byDate.keys()].sort().reverse().slice(0, daysBack);

        return dates.map((date): HistoryDay => {
          const items = (byDate.get(date) ?? []).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
          );
          const reflectionsByItem: Record<string, Reflection[]> = {};
          for (const item of items) {
            const refs = (reflectionsBySuggestion.get(item.id) ?? [])
              .slice()
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            if (refs.length > 0) reflectionsByItem[item.id] = refs;
          }
          return { date, items, reflectionsByItem };
        });
      });

    /**
     * Delete a goal and everything it owns (suggestions + their reflections).
     * Order matters: collect IDs first, then delete leaves before the trunk.
     */
    const deleteGoalCascade = (goalId: string) =>
      Effect.gen(function* () {
        const removedIds = yield* suggestions.removeForGoal(goalId);
        yield* reflections.removeForSuggestions(removedIds);
        yield* goals.remove(goalId);
      });

    return {
      today,
      stats,
      generate,
      regenerateDay,
      retryGoal,
      skipAndRegenerate,
      regenerateSuggestion,
      history,
      deleteGoalCascade
    } as const;
  })
}) {}

export { GoalNotFoundError, SuggestionNotFoundError };
