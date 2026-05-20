/**
 * High-level integrations service used by IPC handlers.
 * Composes the Composio client + Electron shell.
 *
 * No local SQLite cache — Composio is authoritative for connection state,
 * and the renderer caches the joined view via TanStack Query.
 */
import { shell } from "electron";
import { Composio } from "@composio/core";
import {
  ComposioConfigError,
  ensureManagedAuthConfig,
  getUserId,
  listConnections as fetchRemoteConnections,
  listToolkits as fetchToolkits,
  startConnection,
  type ConnectionSummary,
  type ToolkitSummary
} from "./composio";

let cachedToolkits: ToolkitSummary[] | null = null;
let toolkitsCachedAt = 0;
const TOOLKIT_TTL_MS = 60 * 60 * 1000; // 1 hour

export type IntegrationStatus = "connected" | "available" | "unsupported";

export type IntegrationView = {
  toolkit: ToolkitSummary;
  status: IntegrationStatus;
  connection: ConnectionSummary | null;
};

export async function listToolkits(forceRefresh = false): Promise<ToolkitSummary[]> {
  const stale = forceRefresh || !cachedToolkits || Date.now() - toolkitsCachedAt > TOOLKIT_TTL_MS;
  if (stale) {
    cachedToolkits = await fetchToolkits();
    toolkitsCachedAt = Date.now();
  }
  return cachedToolkits!;
}

export async function getIntegrations(): Promise<IntegrationView[]> {
  const userId = getUserId();
  const [toolkits, connections] = await Promise.all([
    listToolkits(),
    fetchRemoteConnections(userId)
  ]);

  const bySlug = new Map(connections.map((c) => [c.toolkitSlug, c] as const));

  return toolkits.map((t): IntegrationView => {
    const conn = bySlug.get(t.slug) ?? null;
    const supported = t.noAuth || t.managedAuthSchemes.length > 0;
    const status: IntegrationStatus = conn
      ? "connected"
      : supported
        ? "available"
        : "unsupported";
    return { toolkit: t, status, connection: conn };
  });
}

export async function refreshConnections(): Promise<ConnectionSummary[]> {
  const userId = getUserId();
  return fetchRemoteConnections(userId);
}

export type ConnectStart = {
  connectionId: string;
  redirectUrl: string | null;
};

export async function beginConnect(toolkitSlug: string): Promise<ConnectStart> {
  const userId = getUserId();
  const result = await startConnection(toolkitSlug, userId);
  if (result.redirectUrl) {
    void shell.openExternal(result.redirectUrl);
  }
  return result;
}

/** Block until Composio reports the connection as active (or 3 min timeout). */
export async function awaitConnect(toolkitSlug: string): Promise<ConnectionSummary | null> {
  const userId = getUserId();
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new ComposioConfigError("COMPOSIO_API_KEY missing");
  const composio = new Composio({ apiKey });
  const authConfigId = await ensureManagedAuthConfig(toolkitSlug);
  const request = await composio.connectedAccounts.link(userId, authConfigId);
  if (request.redirectUrl) void shell.openExternal(request.redirectUrl);

  await request.waitForConnection(180_000);
  const fresh = await fetchRemoteConnections(userId);
  return fresh.find((c) => c.toolkitSlug === toolkitSlug) ?? null;
}

export async function disconnectIntegration(toolkitSlug: string): Promise<void> {
  const userId = getUserId();
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new ComposioConfigError("COMPOSIO_API_KEY missing");
  const composio = new Composio({ apiKey });
  const existing = (await fetchRemoteConnections(userId)).find((c) => c.toolkitSlug === toolkitSlug);
  if (!existing) return;
  try {
    await (composio.connectedAccounts as unknown as {
      delete: (id: string) => Promise<unknown>;
    }).delete(existing.id);
  } catch (err) {
    console.error(`[integrations] composio delete failed:`, err);
    throw err;
  }
}
