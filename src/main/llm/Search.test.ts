import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Search } from "./Search";

describe.sequential("resilient web search", () => {
  const originalExaKey = process.env.EXA_API_KEY;
  const originalOllamaKey = process.env.OLLAMA_WEB_SEARCH_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("EXA_API_KEY", originalExaKey);
    restoreEnv("OLLAMA_WEB_SEARCH_API_KEY", originalOllamaKey);
  });

  it("falls back from a permanently failing Exa request to Ollama", async () => {
    process.env.EXA_API_KEY = "exa-test";
    process.env.OLLAMA_WEB_SEARCH_API_KEY = "ollama-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.exa.ai")) {
        return new Response(JSON.stringify({ error: "invalid key" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Ollama result",
              url: "https://example.com/resource",
              content: "Useful source"
            }
          ]
        }),
        { status: 200 }
      );
    });

    const results = await runSearch(["resilient systems"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0]?.provider).toBe("ollama");
  });

  it("keeps successful query results when a sibling query fails", async () => {
    process.env.EXA_API_KEY = "exa-test";
    delete process.env.OLLAMA_WEB_SEARCH_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query === "broken query") {
        return new Response(JSON.stringify({ error: "invalid query" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Working result",
              url: "https://example.com/working",
              highlights: ["Grounded content"]
            }
          ]
        }),
        { status: 200 }
      );
    });

    const results = await runSearch(["broken query", "working query"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.title)).toEqual(["Working result"]);
  });
});

function runSearch(queries: string[]) {
  return Effect.runPromise(
    Search.pipe(
      Effect.flatMap((search) => search.search(queries)),
      Effect.provide(Search.Default)
    )
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
