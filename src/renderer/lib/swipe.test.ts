import { describe, expect, it } from "vitest";
import { SWIPE, shouldCommitSwipe } from "./swipe";

describe("shouldCommitSwipe", () => {
  it("commits once dx passes commitPx, regardless of how slow the drag was", () => {
    expect(shouldCommitSwipe(SWIPE.commitPx + 8, 5000)).toBe(true);
  });

  it("does not commit a slow drag that stays under commitPx", () => {
    // 50px over 1000ms is well below flickVelocity (0.05 px/ms < 0.3 px/ms).
    expect(shouldCommitSwipe(50, 1000)).toBe(false);
  });

  it("commits a fast flick that reaches flickMinPx but not commitPx", () => {
    // 30px over 50ms = 0.6 px/ms, above flickVelocity.
    expect(shouldCommitSwipe(30, 50)).toBe(true);
  });

  it("does not commit a fast flick that never reaches flickMinPx", () => {
    // 15px over 10ms = 1.5 px/ms (fast) but under flickMinPx (24px).
    expect(shouldCommitSwipe(15, 10)).toBe(false);
  });

  it("does not divide by zero or commit on zero/negative elapsed time", () => {
    expect(shouldCommitSwipe(50, 0)).toBe(false);
    expect(shouldCommitSwipe(50, -10)).toBe(false);
  });

  it("mirrors behavior for negative dx (left swipe)", () => {
    expect(shouldCommitSwipe(-(SWIPE.commitPx + 8), 5000)).toBe(true);
    expect(shouldCommitSwipe(-30, 50)).toBe(true);
    expect(shouldCommitSwipe(-50, 1000)).toBe(false);
  });
});
