import type { Goal, Reflection, Suggestion, SuggestionDraft } from "~/shared/types";
import type { ContextBlock } from "../context/types";

const LOCAL_HOST = "http://localhost:11434";
const CLOUD_HOST = "https://ollama.com";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const DEFAULT_LOCAL_MODEL = "gpt-oss:120b-cloud";
const DEFAULT_CLOUD_MODEL = "gpt-oss:120b";

// Deep search does multi-step planning + reasoning to surface specific, real
// resources instead of whatever ranks first. "deep-lite" keeps latency ~4s;
// bump to "deep" for harder goals at the cost of more latency.
const EXA_SEARCH_TYPE = "deep-lite";
const EXA_SEARCH_SYSTEM_PROMPT =
  "Find specific, high-quality, directly actionable resources for the user's goal. " +
  "Strongly prefer primary and authoritative sources: official docs, the original author's blog or essay, " +
  "reputable engineering blogs (company or personal), canonical books, and well-known practitioner sites. " +
  "Avoid SEO content farms, thin listicles, auto-generated roundups, and low-quality aggregators. " +
  "Each result should be a concrete thing the user can read, watch, or do today.";

const QUERY_SYSTEM_INSTRUCTIONS = `You generate web search queries. Given a personal goal (and any context), output 1-3 concise, high-signal web search queries that would surface specific, current, high-quality resources (articles, tutorials, docs, tools) the user could act on today.

Rules:
- Prefer concrete nouns and specifics over filler words like "best" or "how to".
- Each query should target a different angle when more than one is useful.
- Respond with ONLY a JSON object (no prose, no code fences): {"queries": string[]}`;

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

You MUST respond with ONLY a JSON object (no prose, no code fences). Shape:
{
  "title": string,
  "summary": string,
  "detailMarkdown": string,
  "resourceUrl": string | null,
  "estimatedMinutes": number | null
}`;

export type HistoryItem = {
  suggestion: Suggestion;
  reflections: Reflection[];
};

export type GenerateInput = {
  goal: Goal;
  history: HistoryItem[];
  date: string;
  contextBlocks?: ContextBlock[];
  model?: string;
  onStatus?: (label: string) => void;
};

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
  error?: string;
};

type OllamaWebSearchResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  error?: string;
};

type ExaSearchResponse = {
  results?: Array<{ title?: string; url?: string; highlights?: string[]; text?: string }>;
  // Deep search variants synthesize an answer and ground it in vetted citations.
  output?: {
    content?: string;
    grounding?: Array<{
      citations?: Array<{ url?: string; title?: string }>;
    }>;
  };
};

export class OllamaError extends Error {
  constructor(message: string, readonly raw?: string) {
    super(message);
    this.name = "OllamaError";
  }
}

// Without these, a hung host blocks the coalesced in-flight generation
// forever — the UI just shows "Composing…" until the process restarts.
const CHAT_TIMEOUT_MS = 120_000;
const SEARCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  what: string
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new OllamaError(`${what} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  }
}

export async function generateSuggestion(input: GenerateInput): Promise<SuggestionDraft> {
  const model = input.model ?? defaultModel();

  const queries = await buildSearchQueries(input, model);
  const searchResults = await searchWeb(input, queries);
  input.onStatus?.("Drafting today's action...");

  const raw = await chat({
    model,
    prompt: buildPrompt(input, searchResults)
  });

  return sanitizeUrls(parseDraft(raw), searchResults);
}

/**
 * Ask the model to turn the goal into focused web search queries. This is far
 * cheaper/easier than full synthesis, and good queries are what make the
 * downstream results (and cited URLs) real instead of slop. Falls back to a
 * keyword query if the model is unavailable or returns nothing usable.
 */
async function buildSearchQueries(input: GenerateInput, model: string): Promise<string[]> {
  if (searchProvider() === "none") return [];

  const fallback = [input.goal.title, input.goal.description, input.goal.context]
    .filter(Boolean)
    .join(" ")
    .trim();

  input.onStatus?.("Planning search...");
  const goalBlock = [
    `Goal: ${input.goal.title}`,
    input.goal.description ? `Description: ${input.goal.description}` : null,
    input.goal.context ? `User context: ${input.goal.context}` : null,
    `Today's date: ${input.date}`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await chat({ model, system: QUERY_SYSTEM_INSTRUCTIONS, prompt: goalBlock });
    const parsed = JSON.parse(stripCodeFences(raw).trim()) as { queries?: unknown };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          .map((q) => q.trim())
          .slice(0, 3)
      : [];
    return queries.length ? queries : fallback ? [fallback] : [];
  } catch (err) {
    // A transport/model error (bad model tag, auth, host down) is not something
    // we should paper over - the same model is about to draft the suggestion, so
    // fail loudly now with the real reason instead of silently degrading search.
    if (err instanceof OllamaError) throw err;
    // Otherwise the model just returned something we couldn't parse as queries.
    // That's recoverable: log it and fall back to a keyword query.
    console.warn("[generate] query planning returned unparseable output, using fallback:", err);
    input.onStatus?.("Query planning failed; using a keyword search...");
    return fallback ? [fallback] : [];
  }
}

type SearchResult = { title: string; url: string; content: string };

function searchProvider(): "exa" | "ollama" | "none" {
  if (process.env.EXA_API_KEY) return "exa";
  if (process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY) return "ollama";
  return "none";
}

async function searchWeb(input: GenerateInput, queries: string[]): Promise<SearchResult[]> {
  const provider = searchProvider();
  if (provider === "none" || queries.length === 0) {
    input.onStatus?.("No web search configured; drafting without web results...");
    return [];
  }

  input.onStatus?.("Searching the web...");

  // Run each query, merge, and dedupe by URL so a few angles produce one clean
  // result set. Cap the total so the prompt stays small.
  const perQuery = await Promise.all(
    queries.map((q) => (provider === "exa" ? searchExa(q) : searchOllama(q)))
  );

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of perQuery.flat()) {
    const key = normalizeUrl(r.url);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  return merged.slice(0, 8);
}

async function searchExa(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  const res = await fetchWithTimeout(
    EXA_SEARCH_URL,
    {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: EXA_SEARCH_TYPE,
        numResults: 5,
        systemPrompt: EXA_SEARCH_SYSTEM_PROMPT,
        contents: { highlights: true }
      })
    },
    SEARCH_TIMEOUT_MS,
    "Exa web search"
  );
  const text = await res.text();
  if (!res.ok) throw new OllamaError(`Exa web search failed (${res.status}): ${extractError(text)}`, text);

  let parsed: ExaSearchResponse;
  try {
    parsed = JSON.parse(text) as ExaSearchResponse;
  } catch {
    throw new OllamaError("Exa web search returned non-JSON output", text);
  }

  const results: SearchResult[] = (parsed.results ?? [])
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      content: (r.highlights ?? []).join(" … ").trim() || String(r.text ?? "").slice(0, 1000)
    }));

  // Deep search returns a synthesized answer grounded in citations. Those cited
  // URLs are Exa's vetted picks, so add any that aren't already in results -
  // this keeps them on the URL allowlist the model is restricted to. Attach the
  // synthesized summary as their snippet so the model knows why they matter.
  const summary = String(parsed.output?.content ?? "").slice(0, 1000);
  const known = new Set(results.map((r) => normalizeUrl(r.url)));
  for (const g of parsed.output?.grounding ?? []) {
    for (const c of g.citations ?? []) {
      if (!c.url || known.has(normalizeUrl(c.url))) continue;
      known.add(normalizeUrl(c.url));
      results.push({ title: String(c.title ?? c.url), url: String(c.url), content: summary });
    }
  }

  return results;
}

async function searchOllama(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY;
  if (!apiKey) return [];

  const res = await fetchWithTimeout(
    `${CLOUD_HOST}/api/web_search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, max_results: 5 })
    },
    SEARCH_TIMEOUT_MS,
    "Ollama web search"
  );
  const text = await res.text();
  if (!res.ok) throw new OllamaError(`Ollama web search failed (${res.status}): ${extractError(text)}`, text);

  let parsed: OllamaWebSearchResponse;
  try {
    parsed = JSON.parse(text) as OllamaWebSearchResponse;
  } catch {
    throw new OllamaError("Ollama web search returned non-JSON output", text);
  }
  if (parsed.error) throw new OllamaError(`Ollama web search error: ${parsed.error}`, text);

  return (parsed.results ?? [])
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      content: String(r.content ?? "")
    }));
}

async function chat(input: { model: string; prompt: string; system?: string }): Promise<string> {
  const host = (process.env.OLLAMA_HOST ?? defaultHost()).replace(/\/$/, "");
  const chatApiKey = process.env.OLLAMA_CHAT_API_KEY;
  const cloudApiKey = host === CLOUD_HOST ? process.env.OLLAMA_API_KEY : undefined;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (chatApiKey || cloudApiKey) headers.Authorization = `Bearer ${chatApiKey ?? cloudApiKey}`;

  const res = await fetchWithTimeout(
    `${host}/api/chat`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        stream: false,
        messages: [
          { role: "system", content: input.system ?? SYSTEM_INSTRUCTIONS },
          { role: "user", content: input.prompt }
        ],
        format: "json",
        options: { temperature: 0.4 }
      })
    },
    CHAT_TIMEOUT_MS,
    "Ollama chat"
  );

  const text = await res.text();
  if (!res.ok) {
    // Surface the real reason (e.g. "model 'glm5.2:cloud' not found") instead of
    // just the status code - Ollama returns it in a JSON {error} body.
    throw new OllamaError(`Ollama chat failed (${res.status}): ${extractError(text)}`, text);
  }

  let parsed: OllamaChatResponse;
  try {
    parsed = JSON.parse(text) as OllamaChatResponse;
  } catch {
    throw new OllamaError("Ollama chat returned non-JSON output", text);
  }
  if (parsed.error) throw new OllamaError(`Ollama chat error: ${parsed.error}`, text);

  const content = parsed.message?.content ?? parsed.response;
  if (!content) throw new OllamaError("Ollama chat completed without content", text);
  return content;
}

function defaultHost(): string {
  return process.env.KOMOREBI_WEB === "1" ? CLOUD_HOST : LOCAL_HOST;
}

function defaultModel(): string {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  return process.env.KOMOREBI_WEB === "1" ? DEFAULT_CLOUD_MODEL : DEFAULT_LOCAL_MODEL;
}

function buildPrompt(
  input: GenerateInput,
  searchResults: Array<{ title: string; url: string; content: string }>
): string {
  const { goal, history, date, contextBlocks } = input;

  const goalBlock = [
    `Goal: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    goal.context ? `User context: ${goal.context}` : null,
    `Today's date: ${date}`
  ]
    .filter(Boolean)
    .join("\n");

  const historyBlock = history.length
    ? history.map(formatHistoryItem).join("\n")
    : "(none yet - this is the first suggestion for this goal)";

  const contextSection = contextBlocks?.length
    ? `\n\n## Context\n\n${contextBlocks
        .map((b) => `### ${b.label}\n${b.body}`)
        .join("\n\n")}`
    : "";

  const searchSection = searchResults.length
    ? searchResults
        .map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}`)
        .join("\n\n")
    : "(No web search results available. Prefer a suggestion that does not require a URL unless you are confident the URL is real.)";

  return `---
${contextSection}

## Goal

${goalBlock}

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

function parseDraft(raw: string): SuggestionDraft {
  const cleaned = stripCodeFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new OllamaError("Could not parse suggestion JSON", raw);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OllamaError("Suggestion JSON was not an object", raw);
  }

  const obj = parsed as Record<string, unknown>;
  const required = ["title", "summary", "detailMarkdown"] as const;
  for (const key of required) {
    if (typeof obj[key] !== "string" || (obj[key] as string).length === 0) {
      throw new OllamaError(`Suggestion JSON missing required string field: ${key}`, raw);
    }
  }

  return {
    title: obj.title as string,
    summary: obj.summary as string,
    detailMarkdown: obj.detailMarkdown as string,
    resourceUrl: typeof obj.resourceUrl === "string" ? obj.resourceUrl : null,
    estimatedMinutes:
      typeof obj.estimatedMinutes === "number" && Number.isFinite(obj.estimatedMinutes)
        ? Math.round(obj.estimatedMinutes)
        : null
  };
}

/** Pull a human-readable error out of an Ollama/Exa error body ({"error": "..."}). */
function extractError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      const msg = (parsed.error as { message?: unknown }).message;
      if (typeof msg === "string" && msg) return msg;
    }
  } catch {
    // not JSON
  }
  return body.slice(0, 300).trim() || "no error detail";
}

function stripCodeFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match?.[1] ?? text;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

/**
 * Final guard against fabricated URLs: the model may only cite links that came
 * back from search. Anything else is dropped — resourceUrl is nulled, and
 * markdown links / bare URLs to non-allowlisted destinations are stripped from
 * the detail. This holds regardless of how weak the underlying model is.
 */
function sanitizeUrls(draft: SuggestionDraft, results: SearchResult[]): SuggestionDraft {
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
