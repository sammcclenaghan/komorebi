import { Composio } from "@composio/core";
import type { ContextProvider } from "../types";

function getClient(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
  return new Composio({ apiKey });
}

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

export const stravaProvider: ContextProvider = {
  toolkitSlug: "strava",
  label: "Recent activity",

  async fetch({ userId }) {
    const after = Math.floor((Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000);

    const composio = getClient();
    const result = await composio.tools.execute("STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES", {
      userId,
      arguments: { per_page: 30, after },
      dangerouslySkipVersionCheck: true
    });

    if (!result.successful) {
      throw new Error(`STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES failed: ${result.error}`);
    }

    const activities = extractActivities(result.data);
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
  }
};

function extractActivities(data: unknown): StravaActivity[] {
  if (Array.isArray(data)) return data as StravaActivity[];
  const obj = (data ?? {}) as Record<string, unknown>;
  const candidate =
    obj.response_data ?? obj.data ?? obj.activities ?? obj.items ?? [];
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
