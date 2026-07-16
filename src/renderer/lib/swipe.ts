/** Gesture tuning for row swipe actions. Distances in px, time in ms. */
export const SWIPE = {
  /** Horizontal movement before we treat the touch as a swipe, not a tap/scroll. */
  intentPx: 10,
  /** Drag distance that commits the action on release. */
  commitPx: 72,
  /** A flick commits from this distance if it's fast enough. */
  flickMinPx: 24,
  /** px/ms — flick speed that commits without reaching commitPx. */
  flickVelocity: 0.3,
  /** The row never translates further than this. */
  maxPx: 112,
  /** Resistance divisor when dragging toward a side with no action. */
  resistance: 3,
} as const;

/** Should releasing at `dx` px after `elapsedMs` commit the action? */
export function shouldCommitSwipe(dx: number, elapsedMs: number): boolean {
  const abs = Math.abs(dx);
  if (abs >= SWIPE.commitPx) return true;
  if (abs < SWIPE.flickMinPx || elapsedMs <= 0) return false;
  return abs / elapsedMs >= SWIPE.flickVelocity;
}
