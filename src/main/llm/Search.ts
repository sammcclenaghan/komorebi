/**
 * Web search providers (Exa preferred, Ollama web search fallback) as an
 * Effect service. Search failures are typed (`SearchError`) and the composer
 * degrades gracefully: a broken search never kills a goal's generation, it
 * just produces a draft without web links.
 */
import { Data, Effect } from "effect";
import { CLOUD_HOST, extractError } from "./Ollama";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const SEARCH_TIMEOUT_MS = 30_000;

// Deep search does multi-step planning + reasoning to surface specific, real
// resources instead of whatever ranks first. "deep-lite" keeps latency ~4s;
// bump to "deep" for harder goals at the cost of more latency.
const EXA_SEARCH_TYPE = "deep-lite";
const EXA_SEARCH_SYSTEM_PROMPT =
  "Find specific, high-quality, directly actionable resources for the user's goal. " +
  "Strongly prefer primary and authoritative sources: official docs, the original author's blog or essay, " +
  "reputable engineering blogs (company or personal), canonical books, and well-known practitioner sites. " +
  "Avoid SEO content farms, thin listicles, auto-generated roundups, low-quality aggregators, " +
  "forum threads (e.g. Reddit), generic Medium reposts, and AI-generated slop sites. " +
  "Each result should be a concrete thing the user can read, watch, or do today.";

export class SearchError extends Data.TaggedError("SearchError")<{
  message: string;
  raw?: string;
}> {}

export type SearchResult = { title: string; url: string; content: string };

export type SearchProviderKind = "exa" | "ollama" | "none";

export function searchProvider(): SearchProviderKind {
  if (process.env.EXA_API_KEY) return "exa";
  if (process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY) return "ollama";
  return "none";
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

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

type OllamaWebSearchResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  error?: string;
};

const timedFetch = (
  url: string,
  init: RequestInit,
  what: string
): Effect.Effect<{ status: number; ok: boolean; text: string }, SearchError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
      return { status: res.status, ok: res.ok, text: await res.text() };
    },
    catch: (err) => {
      if (err instanceof Error && err.name === "TimeoutError") {
        return new SearchError({
          message: `${what} timed out after ${Math.round(SEARCH_TIMEOUT_MS / 1000)}s`
        });
      }
      return new SearchError({
        message: `${what} failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

const searchExa = (query: string): Effect.Effect<SearchResult[], SearchError> =>
  Effect.gen(function* () {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) return [];

    const res = yield* timedFetch(
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
      "Exa web search"
    );
    if (!res.ok) {
      return yield* Effect.fail(
        new SearchError({
          message: `Exa web search failed (${res.status}): ${extractError(res.text)}`,
          raw: res.text
        })
      );
    }

    let parsed: ExaSearchResponse;
    try {
      parsed = JSON.parse(res.text) as ExaSearchResponse;
    } catch {
      return yield* Effect.fail(
        new SearchError({ message: "Exa web search returned non-JSON output", raw: res.text })
      );
    }

    const results: SearchResult[] = (parsed.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: String(r.title),
        url: String(r.url),
        content: (r.highlights ?? []).join(" … ").trim() || String(r.text ?? "").slice(0, 1000)
      }));

    // Deep search returns a synthesized answer grounded in citations. Those
    // cited URLs are Exa's vetted picks, so add any that aren't already in
    // results — this keeps them on the URL allowlist the model is restricted
    // to. Attach the synthesized summary as their snippet.
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
  });

const searchOllama = (query: string): Effect.Effect<SearchResult[], SearchError> =>
  Effect.gen(function* () {
    const apiKey = process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY;
    if (!apiKey) return [];

    const res = yield* timedFetch(
      `${CLOUD_HOST}/api/web_search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, max_results: 5 })
      },
      "Ollama web search"
    );
    if (!res.ok) {
      return yield* Effect.fail(
        new SearchError({
          message: `Ollama web search failed (${res.status}): ${extractError(res.text)}`,
          raw: res.text
        })
      );
    }

    let parsed: OllamaWebSearchResponse;
    try {
      parsed = JSON.parse(res.text) as OllamaWebSearchResponse;
    } catch {
      return yield* Effect.fail(
        new SearchError({ message: "Ollama web search returned non-JSON output", raw: res.text })
      );
    }
    if (parsed.error) {
      return yield* Effect.fail(
        new SearchError({ message: `Ollama web search error: ${parsed.error}`, raw: res.text })
      );
    }

    return (parsed.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: String(r.title),
        url: String(r.url),
        content: String(r.content ?? "")
      }));
  });

export class Search extends Effect.Service<Search>()("Search", {
  succeed: {
    provider: searchProvider,
    /**
     * Run each query against the configured provider, merge, and dedupe by
     * URL so a few angles produce one clean result set. Capped so the prompt
     * stays small.
     */
    search: (queries: string[]): Effect.Effect<SearchResult[], SearchError> =>
      Effect.gen(function* () {
        const provider = searchProvider();
        if (provider === "none" || queries.length === 0) return [];

        const perQuery = yield* Effect.forEach(
          queries,
          (q) => (provider === "exa" ? searchExa(q) : searchOllama(q)),
          { concurrency: "unbounded" }
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
      })
  }
}) {}
