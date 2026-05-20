import type { ConnectionSummary } from "../integrations/composio";
import type { ContextBlock, ContextProvider } from "./types";
import { googleCalendarProvider } from "./providers/googleCalendar";

const providers: ContextProvider[] = [googleCalendarProvider];
const bySlug = new Map(providers.map((p) => [p.toolkitSlug, p]));

export function getProvider(slug: string): ContextProvider | undefined {
  return bySlug.get(slug);
}

export function supportedToolkitSlugs(): string[] {
  return [...bySlug.keys()];
}

/**
 * Fan out across every connected integration that has a registered provider,
 * fetch their context blocks in parallel, and collect the non-empty ones.
 * Failures in any one provider are logged but don't block the rest.
 */
export async function buildContextBlocks(input: {
  userId: string;
  connections: ConnectionSummary[];
}): Promise<ContextBlock[]> {
  const tasks = input.connections.map(async (conn): Promise<ContextBlock | null> => {
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

  const results = await Promise.all(tasks);
  return results.filter((b): b is ContextBlock => b !== null);
}
