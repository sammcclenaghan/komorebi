import { Notification } from "electron";
import { showMainWindow } from "./window";

/**
 * Fire a native "your day is ready" notification. Clicking it brings the app
 * forward and routes the renderer to Today. No-op where notifications aren't
 * supported (the OS prompts for permission on first display).
 */
export function notifyChecklistReady(count: number): void {
  if (!Notification.isSupported()) return;

  const body =
    count > 0
      ? `Today's ${count} action${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} ready.`
      : "Time to plan your day.";

  const notification = new Notification({ title: "Komorebi", body });
  notification.on("click", () => {
    const win = showMainWindow();
    win.webContents.send("app:navigate", "today");
  });
  notification.show();
}

/**
 * Evening streak-saver: fired once when the day is nearly over, the streak
 * is alive, and nothing has been completed yet. Clicking opens Today.
 */
export function notifyStreakAtRisk(streak: number): void {
  if (!Notification.isSupported()) return;

  const body =
    streak >= 2
      ? `Your ${streak}-day streak ends tonight. One small task keeps it alive.`
      : "Nothing checked off yet today. One small task keeps the momentum.";

  const notification = new Notification({ title: "Komorebi", body });
  notification.on("click", () => {
    const win = showMainWindow();
    win.webContents.send("app:navigate", "today");
  });
  notification.show();
}
