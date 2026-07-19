/**
 * Daily scheduler. Registers wake/unlock listeners once (a sleeping Mac
 * freezes setTimeout, so we recompute on resume), then schedules the next
 * run — including an immediate catch-up if the app launched after today's
 * configured time.
 */
import { powerMonitor } from "electron";
import { handlers } from "./api/handlers";
import { localDate } from "./checklist/Checklist";
import { notifyChecklistReady, notifyStreakAtRisk } from "./notify";

let timer: ReturnType<typeof setTimeout> | null = null;
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let started = false;

/**
 * When the evening streak-saver checks in. Late enough that a normal day has
 * had its chance, early enough that "one small task" is still realistic.
 */
const NUDGE_TIME = "19:30";

export function startScheduler(): void {
  if (!started) {
    started = true;
    powerMonitor.on("resume", () => void rescheduleScheduler());
    powerMonitor.on("unlock-screen", () => void rescheduleScheduler());
  }
  void rescheduleScheduler();
}

/** Cancel and recompute the next fire time from current settings. */
export async function rescheduleScheduler(): Promise<void> {
  clearTimer();

  const { schedule } = await handlers.settings.get();
  if (!schedule.enabled) return;

  const now = new Date();
  const today = localDate(now);
  const fireToday = atTime(now, schedule.time);

  // Catch-up: it's already past today's time and we haven't run yet today
  // (e.g. the laptop was opened at 9am with the time set to 7am).
  if (now.getTime() >= fireToday.getTime() && schedule.lastRunDate !== today) {
    await runScheduledGeneration();
  }

  const next =
    now.getTime() < fireToday.getTime() ? fireToday : atTime(addDays(now, 1), schedule.time);
  const delay = Math.max(1000, next.getTime() - Date.now());
  timer = setTimeout(() => void onTimer(), delay);

  scheduleStreakNudge(now, schedule.lastNudgeDate);
}

/**
 * Arm the evening streak-saver. Catch-up applies here too: waking a laptop
 * at 9pm should still check the streak, not wait until tomorrow evening.
 */
function scheduleStreakNudge(now: Date, lastNudgeDate: string | null): void {
  const today = localDate(now);
  const nudgeToday = atTime(now, NUDGE_TIME);

  if (now.getTime() >= nudgeToday.getTime() && lastNudgeDate !== today) {
    void runStreakNudge();
  }

  const next =
    now.getTime() < nudgeToday.getTime() ? nudgeToday : atTime(addDays(now, 1), NUDGE_TIME);
  const delay = Math.max(1000, next.getTime() - Date.now());
  nudgeTimer = setTimeout(() => {
    void runStreakNudge().then(() => rescheduleScheduler());
  }, delay);
}

/**
 * Fire the streak-saver if the day warrants it: streak alive (or history
 * exists), nothing completed yet, not already nudged today. Never throws —
 * a failed check must not kill the timers.
 */
async function runStreakNudge(): Promise<void> {
  try {
    const today = localDate();
    const { schedule } = await handlers.settings.get();
    if (!schedule.enabled || schedule.lastNudgeDate === today) return;

    const stats = await handlers.checklist.stats();
    // Only speak up when there's something to protect: a live streak and an
    // empty day. (currentStreak counts back from yesterday when today is
    // empty, so >=1 means the streak survives only if something lands today.)
    if (stats.doneToday > 0 || stats.currentStreak < 1) return;

    // Nothing to do if there's nothing on the list to complete.
    const day = await handlers.checklist.today();
    if (!day.items.some((s) => s.status === "pending" || s.status === "in_progress")) return;

    notifyStreakAtRisk(stats.currentStreak);
    await handlers.settings.update({ schedule: { lastNudgeDate: today } });
  } catch (err) {
    console.error("[scheduler] streak nudge failed:", err);
  }
}

async function onTimer(): Promise<void> {
  await runScheduledGeneration();
  await rescheduleScheduler();
}

/**
 * Generate today's checklist (if not already done today) and notify. Wrapped
 * so a partial-goal failure never kills the timer. `force` bypasses the
 * once-a-day guard — used by the tray's "Compose today now".
 */
export async function runScheduledGeneration(opts: { force?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  try {
    const today = localDate();
    if (!opts.force) {
      const { schedule } = await handlers.settings.get();
      if (schedule.lastRunDate === today) return;
    }

    const result = await handlers.checklist.generate();
    await handlers.settings.markScheduledRun(today);

    if (result.hasGoals) {
      const count = result.items.filter((s) => s.status !== "skipped").length;
      notifyChecklistReady(count);
    }
  } catch (err) {
    console.error("[scheduler] scheduled generation failed:", err);
  } finally {
    running = false;
  }
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (nudgeTimer) {
    clearTimeout(nudgeTimer);
    nudgeTimer = null;
  }
}

/** A Date at today's (or `base`'s) local "HH:MM". */
function atTime(base: Date, hhmm: string): Date {
  const parts = hhmm.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(base);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
