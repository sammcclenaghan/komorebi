/**
 * Composio API smoke check (no UI, no DB).
 *
 * Verifies:
 *  - COMPOSIO_API_KEY works
 *  - We can list all toolkits (expect 100s)
 *  - We can list the current user's connections (likely zero on first run)
 *
 * Run with: pnpm tsx scripts/smoke-composio.ts
 */
import "dotenv/config";
import { listToolkits, listConnections, getUserId } from "../src/main/integrations/composio";

async function main(): Promise<void> {
  const userId = getUserId();
  console.log(`[smoke] userId: ${userId}`);

  console.log("[smoke] listing toolkits (this can take a few seconds)...");
  const t0 = Date.now();
  const toolkits = await listToolkits();
  console.log(`[smoke] got ${toolkits.length} toolkits in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("[smoke] first 5:");
  for (const t of toolkits.slice(0, 5)) {
    console.log(`  - ${t.slug.padEnd(20)} ${t.name}  [${t.authSchemes.join(",")}]`);
  }

  console.log("[smoke] listing user connections...");
  const conns = await listConnections(userId);
  console.log(`[smoke] ${conns.length} existing connections`);
  for (const c of conns) {
    console.log(`  - ${c.toolkitSlug.padEnd(20)} ${c.status}  (id=${c.id})`);
  }
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
