import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Composio } from "@composio/core";
import { resolvePaths } from "../paths";

/**
 * Lightweight wrapper around the Composio SDK so the rest of the app
 * doesn't have to know the exact API shape. All methods accept a
 * `userId` so multi-user is possible later — for now a single local
 * user is created lazily and reused.
 */

let _client: Composio | null = null;
let _userId: string | null = null;

export class ComposioConfigError extends Error {}

function getClient(): Composio {
  if (_client) return _client;
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) {
    throw new ComposioConfigError(
      "COMPOSIO_API_KEY is not set. Add it to .env.local."
    );
  }
  _client = new Composio({ apiKey });
  return _client;
}

export function getUserId(override?: { dataDir?: string }): string {
  if (_userId) return _userId;
  const paths = resolvePaths(override);
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const userIdFile = path.join(paths.dataDir, "user-id");

  if (fs.existsSync(userIdFile)) {
    const existing = fs.readFileSync(userIdFile, "utf8").trim();
    if (existing) {
      _userId = existing;
      return existing;
    }
  }

  const fresh = `user_${randomUUID()}`;
  fs.writeFileSync(userIdFile, fresh, "utf8");
  _userId = fresh;
  return fresh;
}

export type ToolkitSummary = {
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  categories: string[];
  authSchemes: string[];
  managedAuthSchemes: string[];
  isLocal: boolean;
  noAuth: boolean;
};

export async function listToolkits(): Promise<ToolkitSummary[]> {
  const client = getClient();
  // The SDK returns a flat array of toolkits for `.get({})` — not a paginated wrapper.
  const raw = (await client.toolkits.get({} as Record<string, unknown>)) as unknown;
  const items: unknown[] = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] }).items ?? []);

  return items.map((entry) => {
    const t = entry as Record<string, unknown>;
    const meta = (t.meta as Record<string, unknown> | undefined) ?? {};
    const categories = Array.isArray(meta.categories)
      ? (meta.categories as Array<Record<string, unknown>>).map((c) => String(c.name ?? c.slug ?? ""))
      : [];
    return {
      slug: String(t.slug ?? ""),
      name: String(t.name ?? t.slug ?? ""),
      description: typeof meta.description === "string" ? meta.description : null,
      logo: typeof meta.logo === "string" ? meta.logo : null,
      categories: categories.filter(Boolean),
      authSchemes: Array.isArray(t.authSchemes) ? (t.authSchemes as string[]) : [],
      managedAuthSchemes: Array.isArray(t.composioManagedAuthSchemes)
        ? (t.composioManagedAuthSchemes as string[])
        : [],
      isLocal: Boolean(t.isLocalToolkit ?? false),
      noAuth: Boolean(t.noAuth ?? false)
    };
  });
}

export type ConnectionSummary = {
  id: string;
  toolkitSlug: string;
  status: string;
  authConfigId: string | null;
  createdAt: string | null;
};

export async function listConnections(userId: string): Promise<ConnectionSummary[]> {
  const client = getClient();
  const result = await client.connectedAccounts.list({ userIds: [userId] } as Record<string, unknown>);
  const items = (result as { items?: unknown[] }).items ?? [];
  return items.map((raw) => {
    const c = raw as Record<string, unknown>;
    const toolkit = (c.toolkit as Record<string, unknown> | undefined) ?? {};
    const authConfig = (c.authConfig as Record<string, unknown> | undefined)
      ?? (c.auth_config as Record<string, unknown> | undefined)
      ?? {};
    return {
      id: String(c.id ?? ""),
      toolkitSlug: String(toolkit.slug ?? c.toolkitSlug ?? c.toolkit_slug ?? ""),
      status: String(c.status ?? "UNKNOWN"),
      authConfigId: typeof authConfig.id === "string" ? authConfig.id : null,
      createdAt: typeof c.createdAt === "string"
        ? c.createdAt
        : typeof c.created_at === "string"
          ? c.created_at
          : null
    };
  });
}

/**
 * Find or create a Composio-managed auth config for the given toolkit.
 * Composio-managed = uses Composio's own OAuth credentials, so no developer
 * setup needed per toolkit. Falls back gracefully if not all toolkits support
 * managed auth.
 */
export async function ensureManagedAuthConfig(toolkitSlug: string): Promise<string> {
  const client = getClient();
  const existing = await client.authConfigs.list({
    toolkit: toolkitSlug,
    isComposioManaged: true
  } as Record<string, unknown>);
  const items = (existing as { items?: Array<Record<string, unknown>> }).items ?? [];
  if (items.length > 0 && typeof items[0]?.id === "string") {
    return items[0].id;
  }

  // No managed config — try to create one.
  const created = (await client.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth"
  })) as Record<string, unknown>;
  const id = (created.id ?? (created as { authConfigId?: string }).authConfigId) as string | undefined;
  if (!id) {
    throw new ComposioConfigError(
      `Could not create managed auth config for toolkit "${toolkitSlug}"`
    );
  }
  return id;
}

export type ConnectionStart = {
  connectionId: string;
  redirectUrl: string | null;
};

export async function startConnection(toolkitSlug: string, userId: string): Promise<ConnectionStart> {
  const client = getClient();
  const authConfigId = await ensureManagedAuthConfig(toolkitSlug);
  const request = await client.connectedAccounts.link(userId, authConfigId);
  return {
    connectionId: request.id,
    redirectUrl: request.redirectUrl ?? null
  };
}

export async function disconnect(connectionId: string): Promise<void> {
  const client = getClient();
  await (client.connectedAccounts as unknown as {
    delete: (id: string) => Promise<unknown>;
  }).delete(connectionId);
}
