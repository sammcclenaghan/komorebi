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
  SearchQueriesSchema,
  SuggestionDraftSchema,
  searchQueriesJsonSchema,
  suggestionDraftJsonSchema,
  type Reflection,
  type Suggestion,
  type SuggestionDraft
} from "~/shared/schema";
import type { Goal } from "~/shared/schema";
import type { ContextBlock } from "../context/types";
import { Ollama, defaultModel, type LlmError } from "./Ollama";
import { Search, normalizeUrl, searchProvider, type SearchResult } from "./Search";

const SYSTEM_INSTRUCTIONS = `You are Komorebi, a personal AI that turns long-term goals into one concrete daily action.

For the given goal, produce ONE specific action the user can do today that meaningfully advances the goal.

Rules:
- Be concrete. "Read about React hooks" is bad. "Read 'A Complete Guide to useEffect' by Dan Abramov (overreacted.io)" is good.
- Use the supplied web search results to choose real, current, high-quality resources.
- URLS ARE STRICTLY ALLOWLISTED: you may ONLY use URLs that appear verbatim in the "Web search results" section below. NEVER invent, guess, autocomplete, or modify a URL. If no result fits, set resourceUrl to null and include no link in detailMarkdown.
- Don't repeat past suggestions in the history. Match difficulty and style to what the user actually engaged with.
- READ the history carefully:
   - Thumbs up means the user liked it -> produce more in that direction.
   - Thumbs down means the user didn't -> change the level, style, or angle.
   - [skipped] means they bounced off it -> likely too long, too generic, or wrong time of day.
   - "Note:" lines are the user's own notes about how it went. These outrank everything else.
- If a "Context" section is provided, USE it - match the time estimate to actual open time, don't suggest something that conflicts with scheduled events, and let what's happening today shape the suggestion.
- Respect estimated time. Default to 20-40 minutes unless the user's context implies otherwise.
- The detailMarkdown is the page the user opens - include the link, why this resource, and what to focus on. Markdown formatting OK.

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
- Respond with a JSON object: {"queries": string[]}`;

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
  /**
   * One-off steering note for this composition only (e.g. the user's
   * "regenerate, but shorter" note). Unlike a reflection it isn't persisted.
   */
  extraNote?: string;
  onStatus?: (label: string) => void;
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
          }
        } else {
          input.onStatus?.("No web search configured; drafting without web results...");
        }

        input.onStatus?.("Drafting today's action...");
        const rawDraft = yield* draft(input, model, results);
        return sanitizeUrls(rawDraft, results);
      });

    return { compose } as const;
  })
}) {}

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

function goalBlock(input: ComposeInput): string {
  const { goal, date } = input;
  return [
    `Goal: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    goal.context ? `User context: ${goal.context}` : null,
    `Today's date: ${date}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(input: ComposeInput, searchResults: SearchResult[]): string {
  const { history, contextBlocks, extraNote } = input;

  const historyBlock = history.length
    ? history.map(formatHistoryItem).join("\n")
    : "(none yet - this is the first suggestion for this goal)";

  const contextSection = contextBlocks?.length
    ? `\n\n## Context\n\n${contextBlocks.map((b) => `### ${b.label}\n${b.body}`).join("\n\n")}`
    : "";

  const noteSection = extraNote?.trim()
    ? `\n\n## Instruction for this regeneration\n\nNote: "${extraNote.trim()}" (this outranks everything else)`
    : "";

  const searchSection = searchResults.length
    ? searchResults
        .map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`)
        .join("\n\n")
    : "(No web search results available. Prefer a suggestion that does not require a URL unless you are confident the URL is real.)";

  return `---
${contextSection}${noteSection}

## Goal

${goalBlock(input)}

## Recent history (do not repeat these)

${historyBlock}

## Web search results

${searchSection}

Generate one suggestion now.`;
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
