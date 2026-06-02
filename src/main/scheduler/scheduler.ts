import { powerMonitor } from "electron";
import { generateTodayChecklist, localDate } from "../checklist/orchestrator";
import { getSettings, markScheduledRun } from "../store/settings";
import { notifyChecklistReady } from "../notify";

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let started = false;

/**
 * Start the daily scheduler. Registers wake/unlock listeners once (a sleeping
 * Mac freezes setTimeout, so we recompute on resume), then schedules the next
 * run — including an immediate catch-up if the app launched after today's time.
 */
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

  const { schedule } = await getSettings();
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
}

async function onTimer(): Promise<void> {
  await runScheduledGeneration();
  await rescheduleScheduler();
}

/**
 * Generate today's checklist (if not already done today) and notify. Wrapped so
 * a partial-goal failure never kills the timer. `force` bypasses the once-a-day
 * guard — used by the tray's "Compose today now".
 */
export async function runScheduledGeneration(opts: { force?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  try {
    const today = localDate();
    if (!opts.force) {
      const { schedule } = await getSettings();
      if (schedule.lastRunDate === today) return;
    }

    const result = await generateTodayChecklist();
    await markScheduledRun(today);

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
