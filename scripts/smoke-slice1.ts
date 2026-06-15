/**
 * Slice 1 end-to-end check (no UI):
 *   1. Use a fresh data dir.
 *   2. Seed a "become a better developer" goal.
 *   3. Ask Ollama for one suggestion (uses Ollama web search when configured).
 *   4. Persist the suggestion.
 *   5. Print the result.
 *
 * Run with: pnpm smoke:slice1
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addGoal } from "../src/main/store/goals";
import { insertSuggestion, listRecentSuggestionsForGoal } from "../src/main/store/suggestions";
import { listReflectionsForSuggestion } from "../src/main/store/reflections";
import { generateSuggestion, type HistoryItem } from "../src/main/ollama/generate";

async function main(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "komorebi-smoke-"));
  process.env.KOMOREBI_DATA_DIR = dataDir;
  console.log(`[smoke] data dir: ${dataDir}`);

  const goal = await addGoal({
    title: "Become a better developer",
    description: "Senior-ish full-stack TS engineer wanting deeper systems intuition.",
    context:
      "Strong React + Node. Weakest on distributed systems and database internals. Prefers articles and small coding exercises over books. Has ~30 min on weekdays."
  });
  console.log(`[smoke] seeded goal: ${goal.id} — "${goal.title}"`);

  const recent = await listRecentSuggestionsForGoal(goal.id, 14);
  const history: HistoryItem[] = await Promise.all(
    recent.map(async (s) => ({
      suggestion: s,
      reflections: await listReflectionsForSuggestion(s.id)
    }))
  );
  console.log(`[smoke] history rows: ${history.length}`);

  console.log(`[smoke] calling ollama (may take ~30-60s with web search)...`);
  const t0 = Date.now();
  const draft = await generateSuggestion({
    goal,
    history,
    date: new Date().toISOString().slice(0, 10)
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[smoke] ollama returned in ${elapsed}s`);

  const suggestion = await insertSuggestion({
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

  console.log(`[smoke] done. data dir: ${dataDir}`);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
