import { describe, expect, it } from "vitest";
import type { Suggestion } from "~/shared/schema";
import { computeStats, nextDate, prevDate } from "./stats";

function done(date: string): Suggestion {
  return {
    id: `${date}-${Math.random()}`,
    goalId: "g",
    date,
    title: "t",
    summary: "s",
    detailMarkdown: "d",
    resourceUrl: null,
    estimatedMinutes: null,
    status: "done",
    rating: null,
    generationWarning: null,
    createdAt: `${date}T12:00:00.000Z`,
    completedAt: `${date}T13:00:00.000Z`
  };
}

function pending(date: string): Suggestion {
  return { ...done(date), status: "pending", completedAt: null };
}

describe("date arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(prevDate("2026-03-01")).toBe("2026-02-28");
    expect(prevDate("2026-01-01")).toBe("2025-12-31");
    expect(nextDate("2026-02-28")).toBe("2026-03-01");
  });
});

describe("computeStats", () => {
  it("returns zeros with no history", () => {
    expect(computeStats([], "2026-07-19")).toEqual({
      currentStreak: 0,
      bestStreak: 0,
      totalDone: 0,
      doneToday: 0
    });
  });

  it("counts a streak ending today", () => {
    const all = [done("2026-07-17"), done("2026-07-18"), done("2026-07-19")];
    const stats = computeStats(all, "2026-07-19");
    expect(stats.currentStreak).toBe(3);
    expect(stats.doneToday).toBe(1);
  });

  it("doesn't break the streak just because today is still empty", () => {
    const all = [done("2026-07-17"), done("2026-07-18"), pending("2026-07-19")];
    const stats = computeStats(all, "2026-07-19");
    expect(stats.currentStreak).toBe(2);
    expect(stats.doneToday).toBe(0);
  });

  it("resets the current streak after a missed day, keeping the best", () => {
    const all = [
      done("2026-07-10"),
      done("2026-07-11"),
      done("2026-07-12"),
      // 13th missed
      done("2026-07-14"),
      // 15th–18th missed
      done("2026-07-19")
    ];
    const stats = computeStats(all, "2026-07-19");
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(3);
    expect(stats.totalDone).toBe(5);
  });

  it("skipped and pending items never count", () => {
    const all = [pending("2026-07-18"), { ...done("2026-07-19"), status: "skipped" as const }];
    const stats = computeStats(all, "2026-07-19");
    expect(stats.totalDone).toBe(0);
    expect(stats.currentStreak).toBe(0);
  });

  it("multiple completions on one day count once for the streak", () => {
    const all = [done("2026-07-19"), done("2026-07-19"), done("2026-07-18")];
    const stats = computeStats(all, "2026-07-19");
    expect(stats.currentStreak).toBe(2);
    expect(stats.doneToday).toBe(2);
    expect(stats.totalDone).toBe(3);
  });
});
