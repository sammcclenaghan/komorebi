/**
 * The generation progress bus. The Checklist service emits typed events;
 * transports subscribe imperatively (Electron pushes them over the
 * `checklist:progress` IPC channel, the web server streams them over SSE).
 */
import { Effect } from "effect";
import type { GenerationProgress } from "~/shared/schema";

export type ProgressListener = (event: GenerationProgress) => void;

export class Progress extends Effect.Service<Progress>()("Progress", {
  sync: () => {
    const listeners = new Set<ProgressListener>();

    return {
      emit: (event: GenerationProgress): Effect.Effect<void> =>
        Effect.sync(() => {
          for (const listener of listeners) {
            try {
              listener(event);
            } catch (err) {
              console.error("[progress] listener failed:", err);
            }
          }
        }),
      /** Imperative subscription for transports. Returns an unsubscribe fn. */
      subscribe: (listener: ProgressListener): (() => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    } as const;
  }
}) {}
