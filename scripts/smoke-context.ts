/**
 * Context-aware generation smoke test.
 *
 * 1. Lists connections from Composio.
 * 2. Builds context blocks via the provider registry.
 * 3. Calls Claude with the context blocks attached to the prompt.
 * 4. Prints both the context that fed the prompt and the resulting suggestion
 *    so we can see whether Claude actually used it.
 *
 * Run with: pnpm smoke:context
 *
 * Requires: at least one supported integration connected (currently
 * Google Calendar). Connect it in the app first: pnpm dev → Integrations →
 * Google Calendar → Connect.
 */
import "dotenv/config";
import { getUserId, listConnections } from "../src/main/integrations/composio";
import { buildContextBlocks, supportedToolkitSlugs } from "../src/main/context/registry";
import { generateSuggestion } from "../src/main/claude/generate";

async function main(): Promise<void> {
  const userId = getUserId();
  console.log(`[smoke] userId: ${userId}`);

  const connections = await listConnections(userId);
  console.log(`[smoke] ${connections.length} connections:`);
  for (const c of connections) {
    console.log(`  - ${c.toolkitSlug.padEnd(20)} ${c.status}`);
  }

  const supported = new Set(supportedToolkitSlugs());
  const hasSupportedConn = connections.some((c) => supported.has(c.toolkitSlug));
  if (!hasSupportedConn) {
    console.log(
      `\n[smoke] No connected integrations have a registered context provider.`
    );
    console.log(`[smoke] Supported: ${[...supported].join(", ")}`);
    console.log(`[smoke] Connect one in the app first: pnpm dev → Integrations.`);
    return;
  }

  console.log("\n[smoke] building context blocks...");
  const blocks = await buildContextBlocks({ userId, connections });
  console.log(`[smoke] built ${blocks.length} block(s):`);
  for (const b of blocks) {
    console.log(`\n┌── ${b.label} (${b.toolkitSlug})`);
    for (const line of b.body.split("\n")) {
      console.log(`│ ${line}`);
    }
    console.log(`└──`);
  }

  if (blocks.length === 0) {
    console.log("[smoke] no providers contributed context, aborting.");
    return;
  }

  const goal = {
    id: "test-goal",
    title: "Become a better developer",
    description: "Senior-ish full-stack TS engineer.",
    context:
      "Strong React + Node. Weakest on distributed systems and DB internals. Prefers articles and short coding exercises. Has ~30 min on weekdays.",
    status: "active" as const,
    priority: "medium" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log("\n[smoke] calling claude with context attached (≈30–60s)...");
  const t0 = Date.now();
  const draft = await generateSuggestion({
    goal,
    history: [],
    date: new Date().toISOString().slice(0, 10),
    contextBlocks: blocks
  });
  console.log(`[smoke] returned in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  console.log("=== SUGGESTION ===");
  console.log(`Title:   ${draft.title}`);
  console.log(`Summary: ${draft.summary}`);
  console.log(`URL:     ${draft.resourceUrl ?? "(none)"}`);
  console.log(`Minutes: ${draft.estimatedMinutes ?? "(unset)"}`);
  console.log("\n--- detail markdown ---");
  console.log(draft.detailMarkdown);
  console.log("--- end ---\n");
  console.log("[smoke] If Claude referenced your calendar / open time in the suggestion, the context worked.");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
