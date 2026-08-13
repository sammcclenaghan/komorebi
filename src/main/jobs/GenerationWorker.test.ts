import { describe, expect, it } from "vitest";
import { retryDelayMs } from "./GenerationWorker";

describe("generation retry backoff", () => {
  it("backs off exponentially with bounded jitter", () => {
    expect(retryDelayMs(1, () => 0)).toBe(2_500);
    expect(retryDelayMs(2, () => 0.5)).toBe(10_000);
    expect(retryDelayMs(3, () => 1)).toBe(30_000);
  });

  it("caps the base delay at fifteen minutes", () => {
    expect(retryDelayMs(20, () => 0.5)).toBe(15 * 60_000);
  });
});
