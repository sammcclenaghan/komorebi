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
import { Integrations } from "./integrations/Integrations";
import { LinkPreview } from "./links/LinkPreview";
import { Composer } from "./llm/Composer";
import { GoalsRepo } from "./repo/Goals";
import { ReflectionsRepo } from "./repo/Reflections";
import { SettingsRepo } from "./repo/Settings";
import { SuggestionsRepo } from "./repo/Suggestions";
import { Weather } from "./weather/Weather";

const AppLayer = Layer.mergeAll(
  Db.Default,
  GoalsRepo.Default,
  SuggestionsRepo.Default,
  ReflectionsRepo.Default,
  SettingsRepo.Default,
  Composer.Default,
  Context.Default,
  Integrations.Default,
  Weather.Default,
  LinkPreview.Default,
  Progress.Default,
  Checklist.Default
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
