/**
 * The suggestion composer: goal + history + context → one concrete action.
 *
 * Three-step pipeline, all Effect:
 *   1. Plan 1–3 web search queries (structured output; falls back to a
 *      keyword query if the model's plan is unusable).
 *   2. Search the web (Exa or Ollama). A search failure degrades to
 *      "no results" instead of failing the goal.
 *   3. Draft the suggestion (structured output constrained to the
 *      SuggestionDraft JSON schema), decode with Effect Schema, and — if the
 *      model still managed to produce an invalid draft — retry, feeding the
 *      validation errors back so the second attempt can correct them.
 *
 * Finally, URLs are sanitized against the search-result allowlist so a weak
 * model can never fabricate links.
 */
import { Data, Effect, Schema } from "effect";
import {
  CoachNotesSchema,
  DayBriefSchema,
  SearchQueriesSchema,
  SuggestionDraftSchema,
  coachNotesJsonSchema,
  dayBriefJsonSchema,
  searchQueriesJsonSchema,
  suggestionDraftJsonSchema,
  type ChecklistStats,
  type Reflection,
  type Suggestion,
  type SuggestionDraft
} from "~/shared/schema";
import type { Goal, GenerationNoticeKind } from "~/shared/schema";
import type { ContextBlock } from "../context/types";
import { Ollama, defaultModel, type LlmError } from "./Ollama";
import { Search, normalizeUrl, searchProvider, type SearchResult } from "./Search";

const SYSTEM_INSTRUCTIONS = `You are Komorebi, a personal coach. Each day you turn the user's long-term goal into ONE concrete action they can do today that genuinely moves it forward.

Rules:
- Be specific and real. Bad: "Read about React hooks." Good: "Read 'A Complete Guide to useEffect' by Dan Abramov."
- Anchor on a search result: when "Web search results" are present, build the action around the single best one and set resourceUrl to its EXACT url. Favor primary, authoritative sources — official docs, the original author, respected practitioners — over forum threads (e.g. Reddit), generic Medium reposts, SEO listicles, and AI-generated slop sites. Only use urls that appear verbatim in the results; never invent, guess, or edit one. Use null only when nothing there fits.
- Coach off the history: thumbs-up -> more in that direction; thumbs-down -> change the level, style, or angle; [skipped] -> it was likely too long, too generic, or wrong for the moment, so go smaller or different. "Note:" lines are the user's own words and outrank everything else.
- Obey the goal's "Constraints" section exactly (format, difficulty, time). It outranks your defaults.
- detailMarkdown is the page the user opens: include the chosen resource as a [title](url) markdown link, a coach's line on why this one, and what to focus on. Warm but direct — no filler.

Respond with a JSON object of this shape:
{
  "title": string,
  "summary": string,
  "detailMarkdown": string,
  "resourceUrl": string | null,
  "estimatedMinutes": number | null
}`;

const QUERY_SYSTEM_INSTRUCTIONS = `You generate web search queries. Given a personal goal (and any context), output 1-3 concise, high-signal web search queries that would surface specific, current, high-quality resources (articles, tutorials, docs, tools) the user could act on today.

Rules:
- Prefer concrete nouns and specifics over filler words like "best" or "how to".
- Each query should target a different angle when more than one is useful.
- If the goal's context asks for a specific format or source (e.g. an article, an essay, a video, docs, a tool, "from experienced engineers"), bias the queries toward surfacing that — e.g. add "article", "blog", "essay", or the domain of expertise so the results match what the user wants to click.
- Respond with a JSON object: {"queries": string[]}`;

const NOTES_SYSTEM_INSTRUCTIONS = `You maintain a coach's private working notes about one user, learned from how they respond to daily tasks.

Given the existing notes and recent evidence (completions, skips with reasons, thumb ratings, the user's own reflection notes), write the UPDATED notes.

Rules:
- Capture only durable, actionable preferences: formats that land (video vs. article vs. build-something), session length, difficulty, time of day, topics or angles that get skipped.
- Evidence-based, never invented. One thumbs-down is a data point; a pattern is a note.
- Keep what's still supported, drop what new evidence contradicts, merge duplicates.
- At most 8 short lines, each starting with "- ". 120 words max. No preamble, no headers.

Respond with a JSON object: {"notes": string}`;

const BRIEF_SYSTEM_INSTRUCTIONS = `You are Komorebi, a warm but no-nonsense personal coach. Each morning you write a short brief for the user's day.

Rules:
- 2-4 sentences, 60 words max. Plain conversational language — no headers, no lists, no URLs, no emoji.
- Ground it in what's actually in front of them: today's tasks, yesterday's outcome, the weather if it matters.
- Acknowledge momentum honestly. A finished yesterday earns a nod; a skipped or empty one gets a fresh start, not guilt.
- If one task is clearly the day's anchor, say which and why. Give them a place to start.
- Never invent tasks, events, or facts that aren't in the input.

Respond with a JSON object: {"brief": string}`;

/** How many times the drafting chat may run in total (1 try + N corrections). */
const MAX_DRAFT_ATTEMPTS = 3;

export class DraftInvalidError extends Data.TaggedError("DraftInvalidError")<{
  message: string;
  raw: string;
}> {}

export type HistoryItem = {
  suggestion: Suggestion;
  reflections: Reflection[];
};

export type ComposeInput = {
  goal: Goal;
  history: HistoryItem[];
  date: string;
  contextBlocks?: ContextBlock[];
  model?: string;
  /** The user's own words about what they want (settings.profile). */
  profile?: string | null;
  /** The coach's learned notes, distilled from past feedback. */
  coachNotes?: string | null;
  /** Completion momentum, so late-day tasks shrink instead of overreaching. */
  stats?: ChecklistStats;
  /**
   * One-off steering note for this composition only (e.g. the user's
   * "regenerate, but shorter" note). Unlike a reflection it isn't persisted.
   */
  extraNote?: string;
  onStatus?: (label: string) => void;
  /** Non-fatal degradations worth surfacing to the user (e.g. search off/failed). */
  onWarning?: (kind: GenerationNoticeKind, message: string) => void;
};

export class Composer extends Effect.Service<Composer>()("Composer", {
  dependencies: [Ollama.Default, Search.Default],
  effect: Effect.gen(function* () {
    const ollama = yield* Ollama;
    const search = yield* Search;

    const planQueries = (input: ComposeInput, model: string): Effect.Effect<string[], LlmError> =>
      Effect.gen(function* () {
        if (searchProvider() === "none") return [];

        const fallback = [input.goal.title, input.goal.description, input.goal.context]
          .filter(Boolean)
          .join(" ")
          .trim();

        input.onStatus?.("Planning search...");
        const raw = yield* ollama.chat({
          model,
          system: QUERY_SYSTEM_INSTRUCTIONS,
          messages: [{ role: "user", content: goalBlock(input) }],
          format: searchQueriesJsonSchema
        });

        const decoded = decodeJson(SearchQueriesSchema)(raw);
        if (decoded._tag === "Left") {
          // The model returned something unusable as queries. That's
          // recoverable: fall back to a keyword query. (Transport/model
          // errors already failed the effect above — those stay loud,
          // because the same model is about to draft the suggestion.)
          input.onStatus?.("Query planning failed; using a keyword search...");
          return fallback ? [fallback] : [];
        }

        const queries = decoded.right.queries
          .filter((q) => q.trim().length > 0)
          .map((q) => q.trim())
          .slice(0, 3);
        return queries.length ? queries : fallback ? [fallback] : [];
      });

    const draft = (
      input: ComposeInput,
      model: string,
      results: SearchResult[]
    ): Effect.Effect<SuggestionDraft, LlmError | DraftInvalidError> =>
      Effect.gen(function* () {
        const prompt = buildPrompt(input, results);
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [
          { role: "user", content: prompt }
        ];

        let lastError = "";
        let lastRaw = "";
        for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            input.onStatus?.("Fixing an invalid draft...");
            messages.push(
              { role: "assistant", content: lastRaw.slice(0, 4000) },
              {
                role: "user",
                content:
                  `That response was invalid: ${lastError}. ` +
                  `Respond again with ONLY the JSON object, fixing those problems. ` +
                  `Every field must be present; title, summary and detailMarkdown must be non-empty strings.`
              }
            );
          }

          const raw = yield* ollama.chat({
            model,
            system: SYSTEM_INSTRUCTIONS,
            messages,
            format: suggestionDraftJsonSchema
          });

          const decoded = decodeJson(SuggestionDraftSchema)(raw);
          if (decoded._tag === "Right") return decoded.right;

          lastError = decoded.left;
          lastRaw = raw;
        }

        return yield* Effect.fail(
          new DraftInvalidError({
            message: `The model produced an invalid suggestion after ${MAX_DRAFT_ATTEMPTS} attempts: ${lastError}`,
            raw: lastRaw
          })
        );
      });

    const compose = (
      input: ComposeInput
    ): Effect.Effect<SuggestionDraft, LlmError | DraftInvalidError> =>
      Effect.gen(function* () {
        const model = input.model ?? defaultModel();

        const queries = yield* planQueries(input, model);

        let results: SearchResult[] = [];
        if (queries.length > 0) {
          input.onStatus?.("Searching the web...");
          // A search failure must not kill the goal — degrade to no results
          // (the URL allowlist then simply stays empty).
          const searched = yield* Effect.either(search.search(queries));
          if (searched._tag === "Right") {
            results = searched.right;
          } else {
            yield* Effect.logWarning(`web search failed: ${searched.left.message}`);
            input.onStatus?.("Web search failed; drafting without web results...");
            input.onWarning?.(
              "search-failed",
              "Web search failed, so this task has no link."
            );
          }
        } else {
          input.onStatus?.("No web search configured; drafting without web results...");
          input.onWarning?.(
            "search-unavailable",
            "Web search isn't set up, so this task has no link."
          );
        }

        input.onStatus?.("Drafting today's action...");
        const rawDraft = yield* draft(input, model, results);
        return sanitizeUrls(rawDraft, results);
      });

    /**
     * The morning coach note. One attempt, no search, no retry ceremony —
     * callers treat a failure as "no brief today" rather than a failed day.
     */
    const composeBrief = (input: BriefInput): Effect.Effect<string, LlmError | DraftInvalidError> =>
      Effect.gen(function* () {
        const model = input.model ?? defaultModel();
        const raw = yield* ollama.chat({
          model,
          system: BRIEF_SYSTEM_INSTRUCTIONS,
          messages: [{ role: "user", content: buildBriefPrompt(input) }],
          format: dayBriefJsonSchema,
          temperature: 0.6
        });

        const decoded = decodeJson(DayBriefSchema)(raw);
        if (decoded._tag === "Left") {
          return yield* Effect.fail(
            new DraftInvalidError({
              message: `The model produced an invalid brief: ${decoded.left}`,
              raw
            })
          );
        }
        // Belt and braces: the prompt forbids URLs, but never render one the
        // model slipped in anyway.
        return decoded.right.brief.replace(/https?:\/\/\S+/g, "").trim();
      });

    /**
     * Re-distill the coach's working notes from recent feedback. Returns the
     * updated notes ("" when there's nothing worth keeping). One attempt —
     * callers fall back to the existing notes on failure.
     */
    const distillNotes = (input: NotesInput): Effect.Effect<string, LlmError | DraftInvalidError> =>
      Effect.gen(function* () {
        const model = input.model ?? defaultModel();
        const raw = yield* ollama.chat({
          model,
          system: NOTES_SYSTEM_INSTRUCTIONS,
          messages: [{ role: "user", content: buildNotesPrompt(input) }],
          format: coachNotesJsonSchema,
          temperature: 0.2
        });

        const decoded = decodeJson(CoachNotesSchema)(raw);
        if (decoded._tag === "Left") {
          return yield* Effect.fail(
            new DraftInvalidError({
              message: `The model produced invalid coach notes: ${decoded.left}`,
              raw
            })
          );
        }
        return decoded.right.notes.trim();
      });

    return { compose, composeBrief, distillNotes } as const;
  })
}) {}

export type NotesInput = {
  existingNotes: string | null;
  /** Recent suggestions (newest first) with their reflections attached. */
  evidence: HistoryItem[];
  model?: string;
};

function buildNotesPrompt(input: NotesInput): string {
  const evidenceBlock = input.evidence.length
    ? input.evidence.map(formatHistoryItem).join("\n")
    : "(no recent activity)";

  return `## Existing notes

${input.existingNotes?.trim() || "(none yet)"}

## Recent evidence (newest first; [liked]/[disliked] are thumb ratings, "Note:" lines are the user's own words)

${evidenceBlock}

Write the updated notes now.`;
}

export type BriefInput = {
  date: string;
  /** Today's composed checklist. */
  today: Suggestion[];
  /** Yesterday's items, for the momentum read. */
  yesterday: Suggestion[];
  stats: ChecklistStats;
  contextBlocks: ContextBlock[];
  /** The user's own words about what they want (settings.profile). */
  profile?: string | null;
  model?: string;
};

function buildBriefPrompt(input: BriefInput): string {
  const todayBlock = input.today.length
    ? input.today
        .map((s) => `- ${s.title}${s.estimatedMinutes ? ` (~${s.estimatedMinutes}m)` : ""}`)
        .join("\n")
    : "(no tasks composed yet)";

  const yesterdayBlock = input.yesterday.length
    ? input.yesterday.map((s) => `- [${s.status}] ${s.title}`).join("\n")
    : "(no tasks yesterday)";

  const contextSection = input.contextBlocks.length
    ? `\n\n## Conditions\n\n${input.contextBlocks.map((b) => `${b.label}: ${b.body}`).join("\n")}`
    : "";

  const streakLine =
    input.stats.currentStreak >= 2
      ? `Current streak: ${input.stats.currentStreak} days with at least one task completed.`
      : `Total tasks completed so far: ${input.stats.totalDone}.`;

  const profileSection = input.profile?.trim()
    ? `\n\n## What the user says they want\n\n${input.profile.trim()}`
    : "";

  return `Today's date: ${input.date}
${streakLine}${profileSection}${contextSection}

## Today's tasks

${todayBlock}

## Yesterday

${yesterdayBlock}

Write the brief now.`;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

type Either<L, R> = { _tag: "Left"; left: L } | { _tag: "Right"; right: R };

/**
 * Parse model output into a schema-validated value. Structured outputs mean
 * the content should already be pure JSON, but stay defensive: strip code
 * fences and extract the outermost object if a model wrapped it anyway.
 */
const decodeJson =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (raw: string): Either<string, A> => {
    const candidates = [raw.trim(), stripCodeFences(raw).trim(), extractJsonObject(raw) ?? ""];
    let parseError = "output was not valid JSON";
    for (const candidate of candidates) {
      if (!candidate) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
        continue;
      }
      const decoded = Schema.decodeUnknownEither(schema)(parsed);
      if (decoded._tag === "Right") return { _tag: "Right", right: decoded.right };
      return { _tag: "Left", left: formatSchemaError(decoded.left.message) };
    }
    return { _tag: "Left", left: parseError };
  };

/** First line of an Effect Schema parse error — enough signal for a retry prompt. */
function formatSchemaError(message: string): string {
  return message.split("\n").slice(0, 6).join(" ").slice(0, 500);
}

function stripCodeFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match?.[1] ?? text;
}

/** Extract the outermost {...} block, for models that pad JSON with prose. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function goalBlock(input: ComposeInput, opts?: { includeContext?: boolean }): string {
  const { goal, date } = input;
  const includeContext = opts?.includeContext ?? true;
  return [
    `Goal: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    includeContext && goal.context ? `User context: ${goal.context}` : null,
    `Today's date: ${date}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(input: ComposeInput, searchResults: SearchResult[]): string {
  const { history, contextBlocks, extraNote, profile, coachNotes, stats } = input;

  const historyBlock = history.length
    ? history.map(formatHistoryItem).join("\n")
    : "(none yet - this is the first suggestion for this goal)";

  const profileSection = profile?.trim()
    ? `\n\n## About the user (their own words)\n\n${profile.trim()}`
    : "";

  const notesSection = coachNotes?.trim()
    ? `\n\n## Coach notes (learned from past feedback)\n\n${coachNotes.trim()}`
    : "";

  const contextSection = contextBlocks?.length
    ? `\n\n## Context\n\n${contextBlocks.map((b) => `### ${b.label}\n${b.body}`).join("\n\n")}`
    : "";

  const goalConstraintsSection = input.goal.context?.trim()
    ? `\n\n## Constraints for this goal (the user's explicit instructions — obey exactly)\n\n${input.goal.context.trim()}`
    : "";

  const momentumSection = stats ? `\n\n## Momentum\n\n${momentumBlock(stats)}` : "";

  const noteSection = extraNote?.trim()
    ? `\n\n## Instruction for this regeneration\n\nNote: "${extraNote.trim()}" (this outranks everything else)`
    : "";

  const searchSection = searchResults.length
    ? searchResults
        .map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`)
        .join("\n\n")
    : "(No web search results available. Prefer a suggestion that does not require a URL unless you are confident the URL is real.)";

  return `---
${profileSection}${goalConstraintsSection}${notesSection}${contextSection}${momentumSection}${noteSection}

## Goal

${goalBlock(input, { includeContext: false })}

## Recent history (do not repeat these)

${historyBlock}

## Web search results

${searchSection}

Generate one suggestion now.`;
}

function momentumBlock(stats: ChecklistStats): string {
  const hour = new Date().getHours();
  const timeOfDay =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "late evening";
  const lines = [
    `Local time of day: ${timeOfDay}.`,
    stats.currentStreak >= 2
      ? `The user is on a ${stats.currentStreak}-day completion streak.`
      : null,
    stats.doneToday > 0
      ? `They have already completed ${stats.doneToday} task${stats.doneToday === 1 ? "" : "s"} today.`
      : `Nothing is completed yet today.`
  ];
  return lines.filter(Boolean).join(" ");
}

function formatHistoryItem({ suggestion: s, reflections }: HistoryItem): string {
  const ratingMark = s.rating === "up" ? "[liked] " : s.rating === "down" ? "[disliked] " : "";
  const head =
    `- ${s.date} [${s.status}] ${ratingMark}${s.title}` +
    (s.resourceUrl ? ` (${s.resourceUrl})` : "");
  if (reflections.length === 0) return head;
  const notes = reflections
    .map((r) => `  Note: "${r.text.replace(/\s+/g, " ").trim()}"`)
    .join("\n");
  return `${head}\n${notes}`;
}

// ---------------------------------------------------------------------------
// URL sanitization
// ---------------------------------------------------------------------------

/**
 * Final guard against fabricated URLs: the model may only cite links that came
 * back from search. Anything else is dropped — resourceUrl is nulled, and
 * markdown links / bare URLs to non-allowlisted destinations are stripped from
 * the detail. This holds regardless of how weak the underlying model is.
 */
export function sanitizeUrls(draft: SuggestionDraft, results: SearchResult[]): SuggestionDraft {
  const allow = new Set(results.map((r) => normalizeUrl(r.url)));
  const isAllowed = (url: string) => allow.has(normalizeUrl(url));

  const resourceUrl = draft.resourceUrl && isAllowed(draft.resourceUrl) ? draft.resourceUrl : null;

  const detailMarkdown = draft.detailMarkdown
    // [text](url) -> keep if allowlisted, else collapse to the link text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) =>
      isAllowed(url) ? `[${label}](${url})` : label
    )
    // bare URLs not in a markdown link -> drop if not allowlisted
    .replace(/(?<!\]\()\bhttps?:\/\/[^\s)\]]+/g, (url: string) => (isAllowed(url) ? url : ""));

  return { ...draft, resourceUrl, detailMarkdown };
}
