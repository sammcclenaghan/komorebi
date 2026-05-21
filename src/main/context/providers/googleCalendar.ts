import { Composio } from "@composio/core";
import type { ContextProvider } from "../types";

function getClient(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
  return new Composio({ apiKey });
}

type CalendarEvent = {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const WAKING_HOURS = 14; // 8am–10pm baseline

export const googleCalendarProvider: ContextProvider = {
  toolkitSlug: "googlecalendar",
  label: "Today's calendar",

  async fetch({ userId }) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const composio = getClient();
    const result = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
      userId,
      arguments: {
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 30,
        singleEvents: true,
        orderBy: "startTime"
      },
      dangerouslySkipVersionCheck: true
    });

    if (!result.successful) {
      throw new Error(`GOOGLECALENDAR_EVENTS_LIST failed: ${result.error}`);
    }

    const data = result.data as { items?: CalendarEvent[]; response_data?: { items?: CalendarEvent[] } };
    const events: CalendarEvent[] = data.items ?? data.response_data?.items ?? [];

    if (events.length === 0) {
      return `No events scheduled today — roughly ${WAKING_HOURS}h of open time.`;
    }

    const lines: string[] = [];
    let blockedMinutes = 0;

    for (const e of events) {
      if (!e.start || !e.end) continue;
      const startStr = e.start.dateTime ?? e.start.date;
      const endStr = e.end.dateTime ?? e.end.date;
      if (!startStr || !endStr) continue;

      const isAllDay = Boolean(e.start.date) && !e.start.dateTime;
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const durMin = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
      if (!isAllDay) blockedMinutes += durMin;

      const timeFmt = (d: Date) =>
        d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const tag = isAllDay ? "all day" : `${timeFmt(startDate)}–${timeFmt(endDate)}`;
      lines.push(`- ${tag}: ${e.summary ?? "(no title)"}`);
    }

    const openMinutes = Math.max(0, WAKING_HOURS * 60 - blockedMinutes);
    const openHours = (openMinutes / 60).toFixed(1);

    return `${lines.join("\n")}\n\n~${openHours}h of open time today.`;
  }
};
