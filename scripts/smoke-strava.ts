/**
 * Strava toolkit discovery (no UI, no DB).
 *
 * Confirms, before we write the context provider:
 *  - Strava supports Composio-managed auth (so the Integrations card is
 *    "available", not "unsupported").
 *  - The exact action slug + arg/response shape for "recent activities".
 *  - Whether the current local user already has a Strava connection — and if so,
 *    executes the activities action and prints a sample so we can see the shape.
 *
 * Run with: pnpm tsx --env-file=.env.local scripts/smoke-strava.ts
 */
import "dotenv/config";
import { Composio } from "@composio/core";
import { getUserId, listConnections, listToolkits } from "../src/main/integrations/composio";

const TOOLKIT = "strava";

function client(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY missing (add to .env.local)");
  return new Composio({ apiKey });
}

async function main(): Promise<void> {
  const userId = getUserId();
  console.log(`[smoke] userId: ${userId}\n`);

  // 1. Toolkit metadata — does Strava support Composio-managed auth?
  const toolkits = await listToolkits();
  const strava = toolkits.find((t) => t.slug === TOOLKIT);
  if (!strava) {
    console.log(`[smoke] No "${TOOLKIT}" toolkit in the Composio catalog.`);
  } else {
    console.log(`[smoke] toolkit: ${strava.name} (${strava.slug})`);
    console.log(`[smoke]   authSchemes:        ${strava.authSchemes.join(", ") || "(none)"}`);
    console.log(`[smoke]   managedAuthSchemes: ${strava.managedAuthSchemes.join(", ") || "(none)"}`);
    console.log(
      `[smoke]   → Integrations card would be: ${
        strava.noAuth || strava.managedAuthSchemes.length > 0 ? "AVAILABLE" : "UNSUPPORTED"
      }\n`
    );
  }

  // 2. Available actions for the toolkit.
  console.log(`[smoke] listing ${TOOLKIT} actions...`);
  const raw = (await (client().tools as unknown as {
    getRawComposioTools: (q: Record<string, unknown>) => Promise<unknown>;
  }).getRawComposioTools({ toolkits: [TOOLKIT], limit: 200 })) as unknown;
  const tools: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : ((raw as { items?: Array<Record<string, unknown>> }).items ?? []);
  console.log(`[smoke] ${tools.length} actions:`);
  for (const t of tools) {
    const slug = String(t.slug ?? t.name ?? "");
    const star = /ACTIV/i.test(slug) ? " ⭐" : "";
    console.log(`  - ${slug}${star}`);
  }

  // 3. If connected, execute the activities action and show the shape.
  const conns = await listConnections(userId);
  const stravaConn = conns.find((c) => c.toolkitSlug === TOOLKIT);
  if (!stravaConn) {
    console.log(
      `\n[smoke] No Strava connection yet. Connect it in the app (pnpm dev → Integrations → Strava),\n` +
        `[smoke] then re-run to see a live activities payload.`
    );
    return;
  }
  console.log(`\n[smoke] Strava connected (${stravaConn.status}). Fetching recent activities...`);
  const after = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
  const result = await client().tools.execute("STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES", {
    userId,
    arguments: { per_page: 10, after },
    dangerouslySkipVersionCheck: true
  } as Record<string, unknown>);
  console.log(`[smoke] successful: ${result.successful}`);
  if (!result.successful) console.log(`[smoke] error: ${result.error}`);
  console.log("[smoke] data shape:");
  console.log(JSON.stringify(result.data, null, 2).slice(0, 4000));
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
