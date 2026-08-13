/**
 * The Effect runtime hosting every backend service. Both transports
 * (Electron IPC and the self-hosted HTTP server) resolve services from this
 * one runtime, so behavior is identical by construction.
 */
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { Checklist } from "./checklist/Checklist";
import { Progress } from "./checklist/Progress";
import { Context } from "./context/Context";
import { Db } from "./db/Db";
import { GenerationJobs } from "./jobs/GenerationJobs";
import { GenerationWorker } from "./jobs/GenerationWorker";
import { LinkPreview } from "./links/LinkPreview";
import { Composer } from "./llm/Composer";
import { BriefsRepo } from "./repo/Briefs";
import { CheckInsRepo } from "./repo/CheckIns";
import { GoalsRepo } from "./repo/Goals";
import { MemoryRepo } from "./repo/Memory";
import { ReflectionsRepo } from "./repo/Reflections";
import { SettingsRepo } from "./repo/Settings";
import { SuggestionsRepo } from "./repo/Suggestions";
import { PathsRepo } from "./repo/Paths";
import { PathPlanner } from "./paths/PathPlanner";
import { Weather } from "./weather/Weather";

const AppLayer = Layer.mergeAll(
  Db.Default,
  GenerationJobs.Default,
  GoalsRepo.Default,
  SuggestionsRepo.Default,
  PathsRepo.Default,
  PathPlanner.Default,
  ReflectionsRepo.Default,
  SettingsRepo.Default,
  BriefsRepo.Default,
  CheckInsRepo.Default,
  MemoryRepo.Default,
  Composer.Default,
  Context.Default,
  Weather.Default,
  LinkPreview.Default,
  Progress.Default,
  Checklist.Default,
  GenerationWorker.Default
);

export const runtime = ManagedRuntime.make(AppLayer);

/** Everything the runtime can provide. */
export type AppServices = Layer.Layer.Success<typeof AppLayer>;

/**
 * Run an effect for a transport boundary. Failures become plain Errors with
 * human-readable messages (what IPC/HTTP can actually serialize), never the
 * pretty-printed fiber trace.
 */
export async function run<A>(effect: Effect.Effect<A, unknown, AppServices>): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const squashed = Cause.squash(exit.cause);
  if (squashed instanceof Error) {
    throw new Error(squashed.message);
  }
  throw new Error(String(squashed));
}

/** Dispose the runtime (closes the DB client). Call on app quit. */
export function disposeRuntime(): Promise<void> {
  return runtime.dispose();
}
