import { describe, expect, it } from "vitest";
import { normalizeOllamaHost } from "./Settings";

describe("normalizeOllamaHost", () => {
  it("accepts self-hosted HTTP and HTTPS URLs and removes trailing slashes", () => {
    expect(normalizeOllamaHost(" http://192.168.1.20:11434/ ")).toBe(
      "http://192.168.1.20:11434"
    );
    expect(normalizeOllamaHost("https://ollama.example.com/api///")).toBe(
      "https://ollama.example.com/api"
    );
  });

  it("uses the server default for blank, malformed, or unsafe URLs", () => {
    expect(normalizeOllamaHost("")).toBeNull();
    expect(normalizeOllamaHost("ollama:11434")).toBeNull();
    expect(normalizeOllamaHost("file:///data/ollama")).toBeNull();
  });
});
