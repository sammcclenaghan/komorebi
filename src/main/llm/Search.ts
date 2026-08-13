/**
 * Web search providers (Exa preferred, Ollama web search fallback) as an
 * Effect service. Search failures are typed (`SearchError`) and the composer
 * degrades gracefully: a broken search never kills a goal's generation, it
 * just produces a draft without web links.
 */
import { Data, Duration, Effect, Schedule } from "effect";
import { CLOUD_HOST, extractError } from "./Ollama";
import { ProviderCircuitBreaker } from "./ProviderCircuitBreaker";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const SEARCH_TIMEOUT_MS = 30_000;
const providerCircuit = new ProviderCircuitBreaker();

export function resetSearchProviderCircuits(): void {
  providerCircuit.reset();
}

// Ordinary resource discovery lets Exa choose the appropriate search mode.
const EXA_SEARCH_SYSTEM_PROMPT =
  "Find specific, high-quality, directly actionable resources for the user's goal. " +
  "Strongly prefer primary and authoritative sources: official docs, the original author's blog or essay, " +
  "reputable engineering blogs (company or personal), canonical books, and well-known practitioner sites. " +
  "Avoid SEO content farms, thin listicles, auto-generated roundups, low-quality aggregators, " +
  "forum threads (e.g. Reddit), generic Medium reposts, and AI-generated slop sites. " +
  "Each result should be a concrete thing the user can read, watch, or do today.";

export class SearchError extends Data.TaggedError("SearchError")<{
  message: string;
  permanent?: boolean;
  raw?: string;
}> {}

export type SearchResult = {
  title: string;
  url: string;
  content: string;
  highlights: string[];
  author: string | null;
  publishedDate: string | null;
  provider: "exa" | "ollama";
  lane: "canonical" | "discovery";
};
export type PathResearch = { summary: string; sources: SearchResult[] };

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

export type ExaSearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    highlights?: string[];
    text?: string;
    author?: string;
    publishedDate?: string;
  }>;
  // Deep search variants synthesize an answer and ground it in vetted citations.
  output?: {
    content?: string | { summary?: unknown };
    grounding?: Array<{
      citations?: Array<{ url?: string; title?: string }>;
    }>;
  };
};

export const buildExaSearchRequest = (
  query: string,
  options: { includeDomains?: string[]; excludeDomains?: string[] } = {}
) => ({
  query,
  type: "auto" as const,
  numResults: 5,
  systemPrompt: EXA_SEARCH_SYSTEM_PROMPT,
  ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
  ...(options.excludeDomains?.length ? { excludeDomains: options.excludeDomains } : {}),
  contents: { highlights: true }
});

export const buildExaPathRequest = (query: string) => ({
  query,
  type: "deep" as const,
  numResults: 8,
  systemPrompt:
    "Research a realistic path using current first-party and authoritative sources. Distinguish sourced requirements from assumptions.",
  outputSchema: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"]
  },
  contents: { highlights: true }
});

export function decodeExaPathResearch(input: unknown): PathResearch {
  if (!input || typeof input !== "object") {
    throw new SearchError({ message: "Exa path research returned invalid JSON" });
  }
  const response = input as ExaSearchResponse;
  const content = response.output?.content;
  let structured: unknown = content;
  if (typeof content === "string") {
    try {
      structured = JSON.parse(content) as unknown;
    } catch {
      structured = { summary: content };
    }
  }
  const summary =
    structured && typeof structured === "object" && "summary" in structured
      ? String(structured.summary ?? "").trim()
      : "";
  const citations = (response.output?.grounding ?? [])
    .flatMap((group) => group.citations ?? [])
    .filter((citation): citation is { url: string; title?: string } =>
      Boolean(citation.url?.trim())
    );
  if (!summary || citations.length === 0) {
    throw new SearchError({
      message: "Exa path research was not grounded in cited sources."
    });
  }
  const results = response.results ?? [];
  return {
    summary,
    sources: citations.map((citation) => {
      const result = results.find(
        (candidate) => candidate.url && normalizeUrl(candidate.url) === normalizeUrl(citation.url)
      );
      return {
        title: citation.title?.trim() || result?.title?.trim() || citation.url,
        url: citation.url,
        content: (result?.highlights ?? []).join(" … ").trim() || String(result?.text ?? "").slice(0, 1500),
        highlights: result?.highlights ?? [],
        author: result?.author?.trim() || null,
        publishedDate: result?.publishedDate?.trim() || null,
        provider: "exa" as const,
        lane: "canonical" as const
      };
    })
  };
}

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

const searchRetry = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(2))
);

const withSearchRetry = <A>(
  effect: Effect.Effect<A, SearchError>
): Effect.Effect<A, SearchError> =>
  effect.pipe(
    Effect.retry({
      schedule: searchRetry,
      while: (error) => !error.permanent
    })
  );

function permanentHttpFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const searchExa = (
  query: string,
  lane: SearchResult["lane"],
  domains: string[]
): Effect.Effect<SearchResult[], SearchError> =>
  Effect.gen(function* () {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) return [];

    const res = yield* timedFetch(
      EXA_SEARCH_URL,
      {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildExaSearchRequest(
            query,
            lane === "canonical"
              ? { includeDomains: domains }
              : { excludeDomains: ["dev.to", "medium.com"] }
          )
        )
      },
      "Exa web search"
    );
    if (!res.ok) {
      return yield* Effect.fail(
        new SearchError({
          message: `Exa web search failed (${res.status}): ${extractError(res.text)}`,
          permanent: permanentHttpFailure(res.status),
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
        content: (r.highlights ?? []).join(" … ").trim() || String(r.text ?? "").slice(0, 1000),
        highlights: r.highlights ?? [],
        author: r.author?.trim() || null,
        publishedDate: r.publishedDate?.trim() || null,
        provider: "exa" as const,
        lane
      }));

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
          permanent: permanentHttpFailure(res.status),
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
        content: String(r.content ?? ""),
        highlights: [] as string[],
        author: null,
        publishedDate: null,
        provider: "ollama" as const,
        lane: "discovery" as const
      }));
  });

const searchWithFallback = (
  query: string,
  lane: SearchResult["lane"],
  domains: string[]
): Effect.Effect<SearchResult[], SearchError> =>
  Effect.gen(function* () {
    let exaFailure: SearchError | null = null;
    if (process.env.EXA_API_KEY && providerCircuit.canRequest("exa")) {
      const exa = yield* Effect.either(withSearchRetry(searchExa(query, lane, domains)));
      if (exa._tag === "Right") {
        providerCircuit.recordSuccess("exa");
        return exa.right;
      }
      providerCircuit.recordFailure("exa", Boolean(exa.left.permanent));
      exaFailure = exa.left;
    } else if (process.env.EXA_API_KEY) {
      exaFailure = new SearchError({
        message: `Exa circuit is open for ${Math.ceil(providerCircuit.remainingMs("exa") / 1000)}s`
      });
    }

    if (
      (process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY) &&
      providerCircuit.canRequest("ollama")
    ) {
      const ollama = yield* Effect.either(withSearchRetry(searchOllama(query)));
      if (ollama._tag === "Right") {
        providerCircuit.recordSuccess("ollama");
        return ollama.right;
      }
      providerCircuit.recordFailure("ollama", Boolean(ollama.left.permanent));
      return yield* Effect.fail(ollama.left);
    }
    if (process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY) {
      return yield* Effect.fail(
        new SearchError({
          message: `Ollama search circuit is open for ${Math.ceil(
            providerCircuit.remainingMs("ollama") / 1000
          )}s`
        })
      );
    }

    if (exaFailure) return yield* Effect.fail(exaFailure);
    return yield* Effect.fail(
      new SearchError({
        message: "No web search provider is configured.",
        permanent: true
      })
    );
  });

export class Search extends Effect.Service<Search>()("Search", {
  succeed: {
    provider: searchProvider,
    /**
     * Run each query against the configured provider, merge, and dedupe by
     * URL so a few angles produce one clean result set. Capped so the prompt
     * stays small.
     */
    search: (
      queries: string[],
      canonicalDomains: string[] = []
    ): Effect.Effect<SearchResult[], SearchError> =>
      Effect.gen(function* () {
        const provider = searchProvider();
        if (provider === "none" || queries.length === 0) return [];

        const searches = [
          ...(canonicalDomains.length
            ? queries.map((query) => searchWithFallback(query, "canonical", canonicalDomains))
            : []),
          ...queries.map((query) => searchWithFallback(query, "discovery", []))
        ];
        const batches = yield* Effect.forEach(
          searches,
          (search) => Effect.either(search),
          { concurrency: "unbounded" }
        );

        const successful = batches
          .filter((batch): batch is Extract<typeof batch, { _tag: "Right" }> =>
            batch._tag === "Right"
          )
          .flatMap((batch) => batch.right);
        if (successful.length === 0) {
          const failure = batches.find(
            (batch): batch is Extract<typeof batch, { _tag: "Left" }> =>
              batch._tag === "Left"
          );
          if (failure) return yield* Effect.fail(failure.left);
        }

        const seen = new Set<string>();
        const merged: SearchResult[] = [];
        // Canonical searches are deliberately queued first above, so the
        // dedupe and cap prefer grounded first-party domains.
        for (const r of successful) {
          const key = normalizeUrl(r.url);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(r);
        }
        return merged.slice(0, 8);
      }),
    researchPath: (query: string): Effect.Effect<PathResearch, SearchError> =>
      Effect.gen(function* () {
        const apiKey = process.env.EXA_API_KEY;
        if (apiKey && providerCircuit.canRequest("exa")) {
          const exaResearch = withSearchRetry(
            Effect.gen(function* () {
              const res = yield* timedFetch(
                EXA_SEARCH_URL,
                {
                  method: "POST",
                  headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
                  body: JSON.stringify(buildExaPathRequest(query))
                },
                "Exa path research"
              );
              if (!res.ok) {
                return yield* Effect.fail(
                  new SearchError({
                    message: `Exa path research failed (${res.status}): ${extractError(res.text)}`,
                    permanent: permanentHttpFailure(res.status),
                    raw: res.text
                  })
                );
              }
              try {
                return decodeExaPathResearch(JSON.parse(res.text) as unknown);
              } catch (error) {
                return yield* Effect.fail(
                  error instanceof SearchError
                    ? error
                    : new SearchError({ message: "Exa path research returned invalid JSON" })
                );
              }
            })
          );
          const result = yield* Effect.either(exaResearch);
          if (result._tag === "Right") {
            providerCircuit.recordSuccess("exa");
            return result.right;
          }
          providerCircuit.recordFailure("exa", Boolean(result.left.permanent));
          if (!(process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY)) {
            return yield* Effect.fail(result.left);
          }
        }

        if (!(process.env.OLLAMA_WEB_SEARCH_API_KEY ?? process.env.OLLAMA_API_KEY)) {
          return yield* Effect.fail(
            apiKey
              ? new SearchError({
                  message: `Exa circuit is open for ${Math.ceil(
                    providerCircuit.remainingMs("exa") / 1000
                  )}s`
                })
              : new SearchError({
                  message: "No web search provider is configured for path research.",
                  permanent: true
                })
          );
        }
        if (!providerCircuit.canRequest("ollama")) {
          return yield* Effect.fail(
            new SearchError({
              message: `Ollama search circuit is open for ${Math.ceil(
                providerCircuit.remainingMs("ollama") / 1000
              )}s`
            })
          );
        }
        const ollama = yield* Effect.either(withSearchRetry(searchOllama(query)));
        if (ollama._tag === "Left") {
          providerCircuit.recordFailure("ollama", Boolean(ollama.left.permanent));
          return yield* Effect.fail(ollama.left);
        }
        providerCircuit.recordSuccess("ollama");
        const sources = ollama.right;
        if (sources.length === 0) {
          return yield* Effect.fail(
            new SearchError({ message: "Ollama web search returned no path research sources." })
          );
        }
        return {
          summary: sources
            .map((source) => `${source.title}: ${source.content}`)
            .join("\n")
            .slice(0, 8_000),
          sources
        };
      })
  }
}) {}
