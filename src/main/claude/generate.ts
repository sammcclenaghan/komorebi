import { runClaude } from "./cli";
import { ClaudeCliError } from "./cli";
import type { Goal, Suggestion, SuggestionDraft } from "~/shared/types";

const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_INSTRUCTIONS = `You are Goalpath, a personal AI that turns long-term goals into one concrete daily action.

For the given goal, produce ONE specific action the user can do today that meaningfully advances the goal.

Rules:
- Be concrete. "Read about React hooks" is bad. "Read 'A Complete Guide to useEffect' by Dan Abramov (overreacted.io)" is good.
- Use WebSearch to find real, current, high-quality resources. Always include a real URL when one exists.
- Match difficulty to what the user has done before. Don't repeat suggestions in the history.
- Respect estimated time. Default to 20-40 minutes unless the user's context implies otherwise.
- The detailMarkdown is the page the user opens — include the link, why this resource, and what to focus on. Markdown formatting OK.

You MUST respond with ONLY a JSON object (no prose, no code fences). Shape:
{
  "title": string,           // <60 chars, what shows on the checklist
  "summary": string,         // 1 sentence, what shows under the title
  "detailMarkdown": string,  // The full detail page content
  "resourceUrl": string | null,
  "estimatedMinutes": number | null
}`;

export type GenerateInput = {
  goal: Goal;
  history: Suggestion[];
  date: string;
  model?: string;
};

export async function generateSuggestion(input: GenerateInput): Promise<SuggestionDraft> {
  const prompt = buildPrompt(input);
  const raw = await runClaude({
    prompt,
    model: input.model ?? DEFAULT_MODEL,
    allowedTools: ["WebSearch"]
  });

  return parseDraft(raw);
}

function buildPrompt(input: GenerateInput): string {
  const { goal, history, date } = input;

  const goalBlock = [
    `Goal: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    goal.context ? `Context: ${goal.context}` : null,
    `Today's date: ${date}`
  ]
    .filter(Boolean)
    .join("\n");

  const historyBlock = history.length
    ? history
        .map(
          (s) =>
            `- ${s.date} [${s.status}] ${s.title}` +
            (s.resourceUrl ? ` (${s.resourceUrl})` : "")
        )
        .join("\n")
    : "(none yet — this is the first suggestion for this goal)";

  return `${SYSTEM_INSTRUCTIONS}

---

${goalBlock}

Recent history (don't repeat these):
${historyBlock}

Generate one suggestion now.`;
}

function parseDraft(raw: string): SuggestionDraft {
  const cleaned = stripCodeFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ClaudeCliError(`Could not parse suggestion JSON`, raw);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ClaudeCliError(`Suggestion JSON was not an object`, raw);
  }

  const obj = parsed as Record<string, unknown>;
  const required = ["title", "summary", "detailMarkdown"] as const;
  for (const key of required) {
    if (typeof obj[key] !== "string" || (obj[key] as string).length === 0) {
      throw new ClaudeCliError(`Suggestion JSON missing required string field: ${key}`, raw);
    }
  }

  return {
    title: obj.title as string,
    summary: obj.summary as string,
    detailMarkdown: obj.detailMarkdown as string,
    resourceUrl: typeof obj.resourceUrl === "string" ? obj.resourceUrl : null,
    estimatedMinutes:
      typeof obj.estimatedMinutes === "number" && Number.isFinite(obj.estimatedMinutes)
        ? Math.round(obj.estimatedMinutes)
        : null
  };
}

function stripCodeFences(text: string): string {
  // Tolerate ```json ... ``` even though we ask for raw JSON.
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match?.[1] ?? text;
}
