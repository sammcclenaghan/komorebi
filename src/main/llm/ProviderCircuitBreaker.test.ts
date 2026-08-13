import { describe, expect, it } from "vitest";
import { ProviderCircuitBreaker } from "./ProviderCircuitBreaker";

describe("ProviderCircuitBreaker", () => {
  it("opens after repeated transient failures and recovers after cooldown", () => {
    let now = 1_000;
    const breaker = new ProviderCircuitBreaker(3, 60_000, 300_000, () => now);

    breaker.recordFailure("exa", false);
    breaker.recordFailure("exa", false);
    expect(breaker.canRequest("exa")).toBe(true);

    breaker.recordFailure("exa", false);
    expect(breaker.canRequest("exa")).toBe(false);
    expect(breaker.remainingMs("exa")).toBe(60_000);

    now += 60_000;
    expect(breaker.canRequest("exa")).toBe(true);
  });

  it("opens immediately for permanent failures and resets on success", () => {
    const breaker = new ProviderCircuitBreaker();

    breaker.recordFailure("ollama", true);
    expect(breaker.canRequest("ollama")).toBe(false);

    breaker.recordSuccess("ollama");
    expect(breaker.canRequest("ollama")).toBe(true);
  });
});
