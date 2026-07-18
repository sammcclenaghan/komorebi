/**
 * Composio SDK wrapper as an Effect service, so the rest of the app doesn't
 * have to know the exact API shape. All methods accept a `userId` so
 * multi-user is possible later — for now a single local user is created
 * lazily and reused (persisted in dataDir/user-id).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Composio as ComposioSdk } from "@composio/core";
import { Data, Effect } from "effect";
import type { ConnectStart, ConnectionSummary, ToolkitSummary } from "~/shared/schema";
import { resolvePaths } from "../paths";

export class ComposioError extends Data.TaggedError("ComposioError")<{
  message: string;
  cause?: unknown;
}> {}

let _userId: string | null = null;

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

function makeClient(): ComposioSdk {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) {
    throw new ComposioError({ message: "COMPOSIO_API_KEY is not set. Add it to .env.local." });
  }
  return new ComposioSdk({ apiKey });
}

const wrap = <A>(what: string, run: (client: ComposioSdk) => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(makeClient()),
    catch: (cause) =>
      cause instanceof ComposioError
        ? cause
        : new ComposioError({
            message: `${what}: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause
          })
  });

async function fetchToolkits(client: ComposioSdk): Promise<ToolkitSummary[]> {
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

async function fetchConnections(
  client: ComposioSdk,
  userId: string
): Promise<ConnectionSummary[]> {
  const result = await client.connectedAccounts.list({ userIds: [userId] } as Record<
    string,
    unknown
  >);
  const items = (result as { items?: unknown[] }).items ?? [];
  return items.map((raw) => {
    const c = raw as Record<string, unknown>;
    const toolkit = (c.toolkit as Record<string, unknown> | undefined) ?? {};
    const authConfig =
      (c.authConfig as Record<string, unknown> | undefined) ??
      (c.auth_config as Record<string, unknown> | undefined) ??
      {};
    return {
      id: String(c.id ?? ""),
      toolkitSlug: String(toolkit.slug ?? c.toolkitSlug ?? c.toolkit_slug ?? ""),
      status: String(c.status ?? "UNKNOWN"),
      authConfigId: typeof authConfig.id === "string" ? authConfig.id : null,
      createdAt:
        typeof c.createdAt === "string"
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
 * setup needed per toolkit.
 */
async function ensureManagedAuthConfigRaw(
  client: ComposioSdk,
  toolkitSlug: string
): Promise<string> {
  const existing = await client.authConfigs.list({
    toolkit: toolkitSlug,
    isComposioManaged: true
  } as Record<string, unknown>);
  const items = (existing as { items?: Array<Record<string, unknown>> }).items ?? [];
  if (items.length > 0 && typeof items[0]?.id === "string") {
    return items[0].id;
  }

  const created = (await client.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth"
  })) as Record<string, unknown>;
  const id = (created.id ?? (created as { authConfigId?: string }).authConfigId) as
    | string
    | undefined;
  if (!id) {
    throw new ComposioError({
      message: `Could not create managed auth config for toolkit "${toolkitSlug}"`
    });
  }
  return id;
}

export class ComposioClient extends Effect.Service<ComposioClient>()("ComposioClient", {
  succeed: {
    listToolkits: (): Effect.Effect<ToolkitSummary[], ComposioError> =>
      wrap("Listing toolkits failed", fetchToolkits),

    listConnections: (userId: string): Effect.Effect<ConnectionSummary[], ComposioError> =>
      wrap("Listing connections failed", (client) => fetchConnections(client, userId)),

    startConnection: (
      toolkitSlug: string,
      userId: string
    ): Effect.Effect<ConnectStart, ComposioError> =>
      wrap("Starting connection failed", async (client) => {
        const authConfigId = await ensureManagedAuthConfigRaw(client, toolkitSlug);
        const request = await client.connectedAccounts.link(userId, authConfigId);
        return {
          connectionId: request.id,
          redirectUrl: request.redirectUrl ?? null
        };
      }),

    /** Start a connection and block until Composio reports it active (or 3 min timeout). */
    connectAndWait: (
      toolkitSlug: string,
      userId: string,
      onRedirect?: (url: string) => void
    ): Effect.Effect<ConnectionSummary | null, ComposioError> =>
      wrap("Connecting failed", async (client) => {
        const authConfigId = await ensureManagedAuthConfigRaw(client, toolkitSlug);
        const request = await client.connectedAccounts.link(userId, authConfigId);
        if (request.redirectUrl) onRedirect?.(request.redirectUrl);
        await request.waitForConnection(180_000);
        const fresh = await fetchConnections(client, userId);
        return fresh.find((c) => c.toolkitSlug === toolkitSlug) ?? null;
      }),

    disconnect: (connectionId: string): Effect.Effect<void, ComposioError> =>
      wrap("Disconnecting failed", async (client) => {
        await (
          client.connectedAccounts as unknown as {
            delete: (id: string) => Promise<unknown>;
          }
        ).delete(connectionId);
      }),

    executeTool: (
      toolSlug: string,
      userId: string,
      args: Record<string, unknown>
    ): Effect.Effect<unknown, ComposioError> =>
      wrap(`${toolSlug} failed`, async (client) => {
        const result = await client.tools.execute(toolSlug, {
          userId,
          arguments: args,
          dangerouslySkipVersionCheck: true
        });
        if (!result.successful) {
          throw new ComposioError({ message: `${toolSlug} failed: ${result.error}` });
        }
        return result.data;
      })
  }
}) {}
