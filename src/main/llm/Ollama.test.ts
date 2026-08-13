import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ollama, resetOllamaChatCircuits } from "./Ollama";

describe.sequential("Ollama circuit breaker", () => {
  const originalHost = process.env.OLLAMA_HOST;

  afterEach(() => {
    vi.restoreAllMocks();
    resetOllamaChatCircuits();
    if (originalHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = originalHost;
  });

  it("short-circuits repeated permanent model failures", async () => {
    process.env.OLLAMA_HOST = "http://ollama.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "model not found" }), { status: 404 })
    );

    const first = await runChat();
    const second = await runChat();

    expect(Exit.isFailure(first)).toBe(true);
    expect(Exit.isFailure(second)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (Exit.isFailure(second) && second.cause._tag === "Fail") {
      expect(second.cause.error.message).toContain("cooling down");
    }
  });
});

function runChat() {
  return Effect.runPromiseExit(
    Ollama.pipe(
      Effect.flatMap((ollama) =>
        ollama.chat({
          model: "missing-model",
          system: "Return JSON.",
          messages: [{ role: "user", content: "hello" }],
          format: { type: "object" }
        })
      ),
      Effect.provide(Ollama.Default)
    )
  );
}
