import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PathPlanDraftSchema } from "~/shared/schema";
import {
  buildExaPathRequest,
  buildExaSearchRequest,
  decodeExaPathResearch
} from "../llm/Search";
import { Db } from "../db/Db";
import { PathsRepo, STALE_PATH_GENERATION_MS } from "../repo/Paths";

const validPlan = {
  assumptions: "The user can spend time each week.",
  researchSummary: "The cited guide recommends an ordered progression.",
  milestones: [
    {
      title: "Second",
      outcome: "A second observable result exists.",
      rationale: "It builds on the first result.",
      completionCriteria: "A reviewer has accepted the second result."
    },
    {
      title: "First",
      outcome: "A first observable result exists.",
      rationale: "It establishes the foundation.",
      completionCriteria: "A reviewer has accepted the first result."
    }
  ]
};

describe("PathPlanDraftSchema", () => {
  const decode = Schema.decodeUnknownEither(PathPlanDraftSchema);

  it("rejects no milestones and blank fields", () => {
    expect(decode({ ...validPlan, milestones: [] })._tag).toBe("Left");
    expect(decode({ ...validPlan, assumptions: " " })._tag).toBe("Left");
    expect(decode({
      ...validPlan,
      milestones: [{ ...validPlan.milestones[0], completionCriteria: "" }]
    })._tag).toBe("Left");
  });
});

describe("Exa request and grounded response contracts", () => {
  it("uses deep structured output only for path research", () => {
    expect(buildExaPathRequest("goal")).toMatchObject({ type: "deep" });
    expect(buildExaPathRequest("goal")).toHaveProperty("outputSchema");
    expect(buildExaSearchRequest("resource")).toMatchObject({ type: "auto" });
    expect(buildExaSearchRequest("resource")).not.toHaveProperty("outputSchema");
    expect(buildExaSearchRequest("resource", { includeDomains: ["docs.example.com"] }))
      .toMatchObject({ includeDomains: ["docs.example.com"] });
    expect(buildExaSearchRequest("resource", { excludeDomains: ["medium.com"] }))
      .toMatchObject({ excludeDomains: ["medium.com"] });
  });

  it("rejects ungrounded output and retains only cited sources", () => {
    expect(() =>
      decodeExaPathResearch({ output: { content: { summary: "Useful" } }, results: [] })
    ).toThrow(/not grounded/);

    expect(
      decodeExaPathResearch({
        output: {
          content: JSON.stringify({ summary: "Useful" }),
          grounding: [{ citations: [{ title: "Primary", url: "https://example.com/a" }] }]
        },
        results: [
          { title: "Primary", url: "https://example.com/a", highlights: ["Evidence"] },
          { title: "Uncited", url: "https://example.com/b", highlights: ["Ignore"] }
        ]
      }).sources
    ).toEqual([{
      title: "Primary",
      url: "https://example.com/a",
      content: "Evidence",
      highlights: ["Evidence"],
      author: null,
      publishedDate: null,
      provider: "exa",
      lane: "canonical"
    }]);
  });
});

describe("persisted path transitions", () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "komorebi-path-test-"));
    process.env.TURSO_DB_URL = `file:${join(directory, "test.db")}`;
  });

  afterAll(() => {
    delete process.env.TURSO_DB_URL;
    rmSync(directory, { recursive: true, force: true });
  });

  it("rejects stale activation and advances by position with explicit evidence", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const paths = yield* PathsRepo;
          const db = yield* Db;

          const freshAttempt = yield* paths.start("goal-fresh");
          const duplicate = yield* Effect.either(paths.start("goal-fresh"));
          expect(duplicate._tag).toBe("Left");

          yield* db.execute("UPDATE goal_paths SET updated_at = ? WHERE id = ?", [
            new Date(Date.now() - STALE_PATH_GENERATION_MS - 1_000).toISOString(),
            freshAttempt.id
          ]);
          const recovered = yield* paths.start("goal-fresh");
          expect(recovered.version).toBe(2);
          expect((yield* paths.getById(freshAttempt.id))?.status).toBe("failed");

          const generating = yield* paths.start("goal-1");
          const draft = yield* paths.saveDraft(generating.id, validPlan, []);
          const stale = yield* Effect.either(paths.activate(draft.id, draft.revision - 1));
          expect(stale._tag).toBe("Left");

          const active = yield* paths.activate(draft.id, draft.revision);
          // Position, not array title or id, determines the current milestone.
          expect(active.milestones.find((milestone) => milestone.status === "current")?.title)
            .toBe("Second");
          const current = active.milestones[0]!;
          const blank = yield* Effect.either(
            paths.completeMilestone(active.id, current.id, " ", active.revision)
          );
          expect(blank._tag).toBe("Left");

          const advanced = yield* paths.completeMilestone(
            active.id,
            current.id,
            "Reviewer approval at https://example.com/review",
            active.revision
          );
          expect(advanced.milestones[0]?.completionEvidence).toContain("Reviewer approval");
          expect(advanced.milestones[1]?.status).toBe("current");

          const completed = yield* paths.completeMilestone(
            advanced.id,
            advanced.milestones[1]!.id,
            "Final reviewer approval",
            advanced.revision
          );
          expect(completed.status).toBe("completed");
          expect(completed.milestones.every((milestone) => milestone.status === "completed")).toBe(true);
        }).pipe(Effect.provide(Layer.merge(PathsRepo.Default, Db.Default)))
      )
    );
  });
});
