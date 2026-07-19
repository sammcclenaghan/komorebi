import type { GenerationWarningKind } from "~/shared/schema";

/** Compact chip label for a degraded task (shown on the checklist row). */
export function warningBadgeLabel(_kind: GenerationWarningKind): string {
  return "no link";
}

/** Full sentence explaining why a task has no link (shown in the detail view). */
export function warningExplanation(kind: GenerationWarningKind): string {
  switch (kind) {
    case "search-unavailable":
      return "Web search isn't set up, so this task has no link.";
    case "search-failed":
      return "Web search failed while composing this, so it has no link.";
  }
}
