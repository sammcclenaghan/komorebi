import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GenerationProgress } from "~/main/checklist/orchestrator";

export type InFlightGoal = {
  id: string;
  title: string;
  state: "pending" | "in-progress" | "error";
  error?: string;
  /** Latest status phrase from the agent (e.g. "Searching: …"). */
  status?: string;
};

export type ChecklistProgress = {
  inFlight: Map<string, InFlightGoal>;
  active: boolean;
};

/**
 * Subscribes to generation progress and mirrors it into local state.
 *
 * Must be called from a component that stays mounted for the whole session
 * (App) — pages are remounted on every navigation (App keys <main> on the
 * current page), and if the subscription lived in one of them, progress
 * events fired while the user was elsewhere would be dropped: the checklist
 * cache would go stale and the in-flight placeholders would reset.
 */
export function useChecklistProgress(): ChecklistProgress {
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState<Map<string, InFlightGoal>>(new Map());
  const [active, setActive] = useState(false);

  useEffect(() => {
    const unsubscribe = window.komorebi.checklist.onProgress((event: GenerationProgress) => {
      switch (event.phase) {
        case "start": {
          setActive(true);
          const fresh = new Map<string, InFlightGoal>();
          for (const g of event.goals) {
            fresh.set(g.id, { id: g.id, title: g.title, state: "pending" });
          }
          setInFlight(fresh);
          break;
        }
        case "goal-start": {
          setInFlight((prev) => {
            const next = new Map(prev);
            const cur = next.get(event.goalId);
            if (cur) next.set(event.goalId, { ...cur, state: "in-progress" });
            return next;
          });
          break;
        }
        case "goal-status": {
          setInFlight((prev) => {
            const next = new Map(prev);
            const cur = next.get(event.goalId);
            if (cur) next.set(event.goalId, { ...cur, status: event.label });
            return next;
          });
          break;
        }
        case "goal-done": {
          setInFlight((prev) => {
            const next = new Map(prev);
            next.delete(event.goalId);
            return next;
          });
          void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
          break;
        }
        case "goal-error": {
          setInFlight((prev) => {
            const next = new Map(prev);
            const cur = next.get(event.goalId);
            if (cur) {
              next.set(event.goalId, { ...cur, state: "error", error: event.message });
            }
            return next;
          });
          break;
        }
        case "done": {
          setActive(false);
          // Clear after a beat so any straggler placeholders fade out cleanly.
          setTimeout(() => setInFlight(new Map()), 400);
          void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
          break;
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);

  return { inFlight, active };
}
