import { describe, expect, it } from "vitest";
import { selectGoalsForToday } from "./selection";
import type { Goal, GoalPriority, Suggestion } from "~/shared/types";

function goal(id: string, priority: GoalPriority, createdAt = "2026-01-01"): Goal {
  return {
    id,
    title: id,
    description: null,
    context: null,
    status: "active",
    priority,
    createdAt,
    updatedAt: createdAt
  };
}

function suggestion(goalId: string, date: string): Suggestion {
  return {
    id: `${goalId}-${date}`,
    goalId,
    date,
    title: "x",
    summary: "x",
    detailMarkdown: "x",
    resourceUrl: null,
    estimatedMinutes: null,
    status: "done",
    rating: null,
    createdAt: `${date}T00:00:00.000Z`,
    completedAt: null
  };
}

describe("selectGoalsForToday", () => {
  it("returns nothing when the limit is zero", () => {
    expect(selectGoalsForToday([goal("a", "high")], [], 0)).toEqual([]);
  });

  it("favors higher-priority goals when slots are scarce", () => {
    const goals = [goal("low", "low"), goal("high", "high"), goal("med", "medium")];
    const picked = selectGoalsForToday(goals, [], 2).map((g) => g.id);
    expect(picked).toEqual(["high", "med"]);
  });

  it("within a tier, picks the least-recently-suggested goal first", () => {
    const goals = [goal("recent", "high"), goal("stale", "high")];
    const history = [suggestion("recent", "2026-06-13"), suggestion("stale", "2026-05-01")];
    const picked = selectGoalsForToday(goals, history, 1).map((g) => g.id);
    expect(picked).toEqual(["stale"]);
  });

  it("treats a never-suggested goal as the most stale", () => {
    const goals = [goal("seen", "medium"), goal("fresh", "medium")];
    const history = [suggestion("seen", "2026-06-13")];
    const picked = selectGoalsForToday(goals, history, 1).map((g) => g.id);
    expect(picked).toEqual(["fresh"]);
  });

  it("rotates lower tiers in only after higher tiers are served", () => {
    const goals = [goal("h", "high"), goal("l", "low")];
    // Even though the low-priority goal is staler, high wins the only slot.
    const history = [suggestion("h", "2026-01-01"), suggestion("l", "2026-06-13")];
    const picked = selectGoalsForToday(goals, history, 1).map((g) => g.id);
    expect(picked).toEqual(["h"]);
  });

  it("never returns more than the limit", () => {
    const goals = Array.from({ length: 10 }, (_, i) => goal(`g${i}`, "medium"));
    expect(selectGoalsForToday(goals, [], 4)).toHaveLength(4);
  });
});
