/**
 * Slice 1 end-to-end check (no UI):
 *   1. Open a fresh DB in a temp dir.
 *   2. Seed a "become a better developer" goal.
 *   3. Ask Claude for one suggestion (uses WebSearch).
 *   4. Persist the suggestion.
 *   5. Print the result.
 *
 * Run with: pnpm smoke:slice1
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, closeDb } from "../src/main/db/db";
import { insertGoal } from "../src/main/db/goals";
import {
  insertSuggestion,
  recentSuggestionsForGoal
} from "../src/main/db/suggestions";
import { generateSuggestion } from "../src/main/claude/generate";

async function main(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "goalpath-smoke-"));
  console.log(`[smoke] data dir: ${dataDir}`);

  const db = openDb({ dataDir });

  const goal = insertGoal(db, {
    title: "Become a better developer",
    description: "Senior-ish full-stack TS engineer wanting deeper systems intuition.",
    context:
      "Strong React + Node. Weakest on distributed systems and database internals. Prefers articles and small coding exercises over books. Has ~30 min on weekdays."
  });

  console.log(`[smoke] seeded goal: ${goal.id} — "${goal.title}"`);

  const history = recentSuggestionsForGoal(db, goal.id, 14);
  console.log(`[smoke] history rows: ${history.length}`);

  console.log(`[smoke] calling claude (may take ~30-60s with WebSearch)...`);
  const t0 = Date.now();
  const draft = await generateSuggestion({
    goal,
    history,
    date: new Date().toISOString().slice(0, 10)
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[smoke] claude returned in ${elapsed}s`);

  const suggestion = insertSuggestion(db, {
    goalId: goal.id,
    date: new Date().toISOString().slice(0, 10),
    draft
  });

  console.log("\n=== SUGGESTION ===");
  console.log(`Title:   ${suggestion.title}`);
  console.log(`Summary: ${suggestion.summary}`);
  console.log(`URL:     ${suggestion.resourceUrl ?? "(none)"}`);
  console.log(`Minutes: ${suggestion.estimatedMinutes ?? "(unset)"}`);
  console.log(`Status:  ${suggestion.status}`);
  console.log("\n--- detail markdown ---");
  console.log(suggestion.detailMarkdown);
  console.log("--- end ---\n");

  closeDb();
  console.log(`[smoke] done. db file: ${path.join(dataDir, "goalpath.db")}`);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
