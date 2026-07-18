import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { SuggestionDraftSchema } from "~/shared/schema";
import { sanitizeUrls } from "./Composer";

const decode = Schema.decodeUnknownEither(SuggestionDraftSchema);

describe("SuggestionDraftSchema", () => {
  it("decodes a well-formed draft", () => {
    const result = decode({
      title: "Read the useEffect guide",
      summary: "A deep dive.",
      detailMarkdown: "Read [this](https://overreacted.io/a-complete-guide-to-useeffect/).",
      resourceUrl: "https://overreacted.io/a-complete-guide-to-useeffect/",
      estimatedMinutes: 30
    });
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.estimatedMinutes).toBe(30);
    }
  });

  it("tolerates model quirks: numeric strings, empty urls, missing optionals", () => {
    const result = decode({
      title: "  Do the thing  ",
      summary: "Why it matters.",
      detailMarkdown: "Steps.",
      resourceUrl: "",
      estimatedMinutes: "45"
    });
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.title).toBe("Do the thing");
      expect(result.right.resourceUrl).toBeNull();
      expect(result.right.estimatedMinutes).toBe(45);
    }
  });

  it('treats the string "null" and absent fields as nulls', () => {
    const result = decode({
      title: "T",
      summary: "S",
      detailMarkdown: "D",
      resourceUrl: "null"
    });
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.resourceUrl).toBeNull();
      expect(result.right.estimatedMinutes).toBeNull();
    }
  });

  it("rejects a draft with an empty required field", () => {
    const result = decode({
      title: "   ",
      summary: "S",
      detailMarkdown: "D",
      resourceUrl: null,
      estimatedMinutes: null
    });
    expect(result._tag).toBe("Left");
  });

  it("rejects a draft missing required fields entirely", () => {
    expect(decode({ title: "only a title" })._tag).toBe("Left");
  });

  it("normalizes nonsense minutes to null instead of failing", () => {
    const result = decode({
      title: "T",
      summary: "S",
      detailMarkdown: "D",
      resourceUrl: null,
      estimatedMinutes: -5
    });
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.estimatedMinutes).toBeNull();
    }
  });
});

describe("sanitizeUrls", () => {
  const results = [
    { title: "Guide", url: "https://example.com/guide", content: "..." }
  ];

  it("keeps allowlisted urls", () => {
    const draft = sanitizeUrls(
      {
        title: "T",
        summary: "S",
        detailMarkdown: "See [the guide](https://example.com/guide).",
        resourceUrl: "https://example.com/guide/",
        estimatedMinutes: null
      },
      results
    );
    // Trailing-slash variant still matches via URL normalization.
    expect(draft.resourceUrl).toBe("https://example.com/guide/");
    expect(draft.detailMarkdown).toContain("(https://example.com/guide)");
  });

  it("strips fabricated urls from resourceUrl and markdown", () => {
    const draft = sanitizeUrls(
      {
        title: "T",
        summary: "S",
        detailMarkdown:
          "Read [fake](https://invented.example.net/post) and https://also-fake.example.org/x today.",
        resourceUrl: "https://invented.example.net/post",
        estimatedMinutes: null
      },
      results
    );
    expect(draft.resourceUrl).toBeNull();
    expect(draft.detailMarkdown).not.toContain("invented.example.net");
    expect(draft.detailMarkdown).not.toContain("also-fake.example.org");
    expect(draft.detailMarkdown).toContain("fake"); // link text survives
  });
});
