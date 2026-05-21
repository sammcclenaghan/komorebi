import type { ConnectionSummary } from "../integrations/composio";
import type { ContextBlock, ContextProvider } from "./types";
import { googleCalendarProvider } from "./providers/googleCalendar";
import { fetchWeatherContext } from "./providers/weather";

const providers: ContextProvider[] = [googleCalendarProvider];
const bySlug = new Map(providers.map((p) => [p.toolkitSlug, p]));

export function getProvider(slug: string): ContextProvider | undefined {
  return bySlug.get(slug);
}

export function supportedToolkitSlugs(): string[] {
  return [...bySlug.keys()];
}

/**
 * Always-on providers don't require an explicit user connection (e.g. they
 * back onto a NO_AUTH toolkit or an app-managed source). They run once per
 * generation pass regardless of which integrations the user has enabled.
 */
async function buildAlwaysOnBlocks(): Promise<ContextBlock[]> {
  const blocks: ContextBlock[] = [];
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "";
    if (city) {
      const body = await fetchWeatherContext(city);
      if (body) blocks.push({ label: "Weather", toolkitSlug: "weathermap", body });
    }
  } catch (err) {
    console.error("[context] weather always-on provider failed:", err);
  }
  return blocks;
}

/**
 * Fan out across every connected integration that has a registered provider,
 * fetch their context blocks in parallel, and collect the non-empty ones.
 * Failures in any one provider are logged but don't block the rest.
 *
 * Additionally include any always-on context blocks (weather, etc.).
 */
export async function buildContextBlocks(input: {
  userId: string;
  connections: ConnectionSummary[];
}): Promise<ContextBlock[]> {
  const connTasks = input.connections.map(async (conn): Promise<ContextBlock | null> => {
    const provider = getProvider(conn.toolkitSlug);
    if (!provider) return null;
    if (conn.status !== "ACTIVE" && !conn.status.toLowerCase().includes("active")) {
      return null;
    }
    try {
      const body = await provider.fetch({ userId: input.userId, connection: conn });
      if (!body) return null;
      return { label: provider.label, toolkitSlug: conn.toolkitSlug, body };
    } catch (err) {
      console.error(`[context] provider "${conn.toolkitSlug}" failed:`, err);
      return null;
    }
  });

  const [connResults, alwaysOn] = await Promise.all([
    Promise.all(connTasks),
    buildAlwaysOnBlocks()
  ]);

  return [...alwaysOn, ...connResults.filter((b): b is ContextBlock => b !== null)];
}
