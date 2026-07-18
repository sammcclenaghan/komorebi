/**
 * High-level integrations service used by the API handlers. Composio is
 * authoritative for connection state; the renderer caches the joined view
 * via TanStack Query. Toolkit metadata is cached for an hour.
 */
import { Effect, Ref } from "effect";
import type {
  ConnectStart,
  ConnectionSummary,
  IntegrationStatus,
  IntegrationView,
  ToolkitSummary
} from "~/shared/schema";
import { ComposioClient, ComposioError, getUserId } from "./Composio";

const TOOLKIT_TTL_MS = 60 * 60 * 1000;

type ToolkitCache = { toolkits: ToolkitSummary[]; at: number } | null;

function openExternal(url: string): void {
  if (!process.versions.electron) return;
  try {
    const { shell } = require("electron") as typeof import("electron");
    void shell.openExternal(url);
  } catch {
    // Web server — the client opens the OAuth URL.
  }
}

export class Integrations extends Effect.Service<Integrations>()("Integrations", {
  dependencies: [ComposioClient.Default],
  effect: Effect.gen(function* () {
    const composio = yield* ComposioClient;
    const cache = yield* Ref.make<ToolkitCache>(null);

    const listToolkits = (forceRefresh = false): Effect.Effect<ToolkitSummary[], ComposioError> =>
      Effect.gen(function* () {
        const cached = yield* Ref.get(cache);
        const stale = forceRefresh || !cached || Date.now() - cached.at > TOOLKIT_TTL_MS;
        if (!stale) return cached.toolkits;
        const toolkits = yield* composio.listToolkits();
        yield* Ref.set(cache, { toolkits, at: Date.now() });
        return toolkits;
      });

    const list = (): Effect.Effect<IntegrationView[], ComposioError> =>
      Effect.gen(function* () {
        const userId = getUserId();
        const [toolkits, connections] = yield* Effect.all(
          [listToolkits(), composio.listConnections(userId)],
          { concurrency: 2 }
        );

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
      });

    const refresh = (): Effect.Effect<ConnectionSummary[], ComposioError> =>
      composio.listConnections(getUserId());

    const beginConnect = (toolkitSlug: string): Effect.Effect<ConnectStart, ComposioError> =>
      composio.startConnection(toolkitSlug, getUserId()).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.redirectUrl) openExternal(result.redirectUrl);
          })
        )
      );

    const awaitConnect = (
      toolkitSlug: string
    ): Effect.Effect<ConnectionSummary | null, ComposioError> =>
      composio.connectAndWait(toolkitSlug, getUserId(), openExternal);

    const disconnect = (toolkitSlug: string): Effect.Effect<void, ComposioError> =>
      Effect.gen(function* () {
        const connections = yield* composio.listConnections(getUserId());
        const existing = connections.find((c) => c.toolkitSlug === toolkitSlug);
        if (!existing) return;
        yield* composio.disconnect(existing.id);
      });

    const connections = (): Effect.Effect<ConnectionSummary[], ComposioError> =>
      composio.listConnections(getUserId());

    return { list, refresh, beginConnect, awaitConnect, disconnect, connections } as const;
  })
}) {}
