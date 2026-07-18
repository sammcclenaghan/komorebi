/**
 * Per-integration context fetchers. Each one turns a connected toolkit's
 * data into a short markdown block for the composer prompt. All of them are
 * pure functions over the ComposioClient service — failures are typed and
 * the Context service swallows them per-provider so one broken integration
 * never blocks the rest.
 */
import { Effect } from "effect";
import { ComposioClient, type ComposioError } from "../integrations/Composio";

export type ProviderFetch = (
  userId: string
) => Effect.Effect<string | null, ComposioError, ComposioClient>;

export type Provider = {
  /** The Composio toolkit slug this provider handles (e.g. "googlecalendar"). */
  toolkitSlug: string;
  /** Section heading in the prompt. */
  label: string;
  fetch: ProviderFetch;
};

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

type CalendarEvent = {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const WAKING_HOURS = 14; // 8am–10pm baseline

const fetchCalendar: ProviderFetch = (userId) =>
  Effect.gen(function* () {
    const composio = yield* ComposioClient;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const data = (yield* composio.executeTool("GOOGLECALENDAR_EVENTS_LIST", userId, {
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: 30,
      singleEvents: true,
      orderBy: "startTime"
    })) as { items?: CalendarEvent[]; response_data?: { items?: CalendarEvent[] } };

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
  });

// ---------------------------------------------------------------------------
// Strava
// ---------------------------------------------------------------------------

/** Subset of the Strava activity shape we care about. */
type StravaActivity = {
  name?: string;
  type?: string;
  sport_type?: string;
  distance?: number; // meters
  moving_time?: number; // seconds
  total_elevation_gain?: number; // meters
  start_date_local?: string;
};

const WINDOW_DAYS = 14;

const fetchStrava: ProviderFetch = (userId) =>
  Effect.gen(function* () {
    const composio = yield* ComposioClient;
    const after = Math.floor((Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000);

    const data = yield* composio.executeTool("STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES", userId, {
      per_page: 30,
      after
    });

    const activities = extractActivities(data);
    if (activities.length === 0) {
      return `No Strava activities logged in the last ${WINDOW_DAYS} days.`;
    }

    // Newest first.
    const sorted = [...activities].sort((a, b) =>
      (b.start_date_local ?? "").localeCompare(a.start_date_local ?? "")
    );

    let totalMeters = 0;
    let totalSeconds = 0;
    const byType = new Map<string, number>();
    for (const a of sorted) {
      totalMeters += typeof a.distance === "number" ? a.distance : 0;
      totalSeconds += typeof a.moving_time === "number" ? a.moving_time : 0;
      const kind = (a.sport_type || a.type || "Activity").replace(/([a-z])([A-Z])/g, "$1 $2");
      byType.set(kind, (byType.get(kind) ?? 0) + 1);
    }

    const typeBreakdown = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${n}× ${kind}`)
      .join(", ");

    const lines: string[] = [
      `${sorted.length} activit${sorted.length === 1 ? "y" : "ies"} in the last ${WINDOW_DAYS} days` +
        ` — ${typeBreakdown}.`,
      `Total: ${formatKm(totalMeters)} over ${formatDuration(totalSeconds)}.`
    ];

    const recent = sorted.slice(0, 3).map((a) => {
      const kind = (a.sport_type || a.type || "Activity").replace(/([a-z])([A-Z])/g, "$1 $2");
      const when = formatDate(a.start_date_local);
      const bits = [kind, formatKm(a.distance ?? 0), formatDuration(a.moving_time ?? 0)]
        .filter((s) => s && s !== "0 km" && s !== "0m")
        .join(", ");
      return `- ${when}: ${a.name?.trim() || kind} (${bits})`;
    });

    return `${lines.join(" ")}\n\nMost recent:\n${recent.join("\n")}`;
  });

function extractActivities(data: unknown): StravaActivity[] {
  if (Array.isArray(data)) return data as StravaActivity[];
  const obj = (data ?? {}) as Record<string, unknown>;
  const candidate = obj.response_data ?? obj.data ?? obj.activities ?? obj.items ?? [];
  return Array.isArray(candidate) ? (candidate as StravaActivity[]) : [];
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km < 0.05) return "0 km";
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------

export const providers: Provider[] = [
  { toolkitSlug: "googlecalendar", label: "Today's calendar", fetch: fetchCalendar },
  { toolkitSlug: "strava", label: "Recent activity", fetch: fetchStrava }
];
