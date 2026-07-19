/**
 * The one place suggestion mutations live. Both the checklist row and the
 * detail view use these, so optimistic updates (and their rollbacks) behave
 * identically everywhere — the old split where the detail view visibly
 * lagged on rating is gone.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChecklistDay,
  Suggestion,
  SuggestionRating,
  SuggestionStatus
} from "~/shared/schema";

export const TODAY_KEY = ["checklist", "today"];

export function useSuggestionMutations(id: string) {
  const queryClient = useQueryClient();

  /**
   * Optimistically patch the suggestion in both caches (today's checklist
   * and the detail query), returning a rollback context.
   */
  async function beginOptimistic(patch: (s: Suggestion) => Suggestion) {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: TODAY_KEY }),
      queryClient.cancelQueries({ queryKey: ["suggestion", id] })
    ]);
    const prevDay = queryClient.getQueryData<ChecklistDay>(TODAY_KEY);
    const prevDetail = queryClient.getQueryData<Suggestion | null>(["suggestion", id]);

    if (prevDay) {
      queryClient.setQueryData(TODAY_KEY, {
        ...prevDay,
        items: prevDay.items.map((s) => (s.id === id ? patch(s) : s))
      });
    }
    if (prevDetail) {
      queryClient.setQueryData(["suggestion", id], patch(prevDetail));
    }
    return { prevDay, prevDetail };
  }

  type Ctx = Awaited<ReturnType<typeof beginOptimistic>> | undefined;

  function rollback(ctx: Ctx) {
    if (ctx?.prevDay) queryClient.setQueryData(TODAY_KEY, ctx.prevDay);
    if (ctx?.prevDetail !== undefined) {
      queryClient.setQueryData(["suggestion", id], ctx.prevDetail);
    }
  }

  function settle() {
    void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["suggestion", id] });
    // Completions move the streak — keep the header chip honest.
    void queryClient.invalidateQueries({ queryKey: ["checklist", "stats"] });
  }

  const setStatus = useMutation({
    mutationFn: (next: SuggestionStatus) =>
      window.komorebi.suggestions.setStatus({ id, status: next }),
    onMutate: (next) =>
      beginOptimistic((s) => ({
        ...s,
        status: next,
        completedAt: next === "done" ? new Date().toISOString() : s.completedAt
      })),
    onError: (_err, _next, ctx) => rollback(ctx),
    onSettled: settle
  });

  const setRating = useMutation({
    mutationFn: (next: SuggestionRating) =>
      window.komorebi.suggestions.setRating({ id, rating: next }),
    onMutate: (next) => beginOptimistic((s) => ({ ...s, rating: next })),
    onError: (_err, _next, ctx) => rollback(ctx),
    onSettled: settle
  });

  const skipRegen = useMutation({
    mutationFn: (reason?: string) =>
      window.komorebi.suggestions.skipAndRegenerate(id, reason || undefined),
    onMutate: () => beginOptimistic((s) => ({ ...s, status: "skipped" as const })),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: settle
  });

  /**
   * Discard-and-redo. No optimistic patch (the row is being replaced
   * entirely); the generation progress events drive the placeholder UI.
   */
  const regenerate = useMutation({
    mutationFn: (note?: string) =>
      window.komorebi.suggestions.regenerate(id, note || undefined),
    onSettled: settle
  });

  return { setStatus, setRating, skipRegen, regenerate };
}
