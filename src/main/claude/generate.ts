import { runClaude, type ClaudeStreamEvent } from "./cli";
import { ClaudeCliError } from "./cli";
import type { Goal, Reflection, Suggestion, SuggestionDraft } from "~/shared/types";
import type { ContextBlock } from "../context/types";

const DEFAULT_MODEL = "claude-haiku-4-5";

const SYSTEM_INSTRUCTIONS = `You are Komorebi, a personal AI that turns long-term goals into one concrete daily action.

For the given goal, produce ONE specific action the user can do today that meaningfully advances the goal.

Rules:
- Be concrete. "Read about React hooks" is bad. "Read 'A Complete Guide to useEffect' by Dan Abramov (overreacted.io)" is good.
- Use WebSearch to find real, current, high-quality resources. Always include a real URL when one exists.
- Don't repeat past suggestions in the history. Match difficulty and style to what the user actually engaged with.
- READ the history carefully:
   - 👍 means the user liked it → produce more in that direction.
   - 👎 means the user didn't → change the level, style, or angle.
   - [skipped] means they bounced off it → likely too long, too generic, or wrong time of day.
   - "↳" lines are the user's own notes about how it went. These outrank everything else.
- If a "Context" section is provided, USE it — match the time estimate to actual open time, don't suggest something that conflicts with scheduled events, and let what's happening today shape the suggestion.
- Respect estimated time. Default to 20–40 minutes unless the user's context implies otherwise.
- The detailMarkdown is the page the user opens — include the link, why this resource, and what to focus on. Markdown formatting OK.

You MUST respond with ONLY a JSON object (no prose, no code fences). Shape:
{
  "title": string,           // <60 chars, what shows on the checklist
  "summary": string,         // 1 sentence, what shows under the title
  "detailMarkdown": string,  // The full detail page content
  "resourceUrl": string | null,
  "estimatedMinutes": number | null
}`;

export type HistoryItem = {
  suggestion: Suggestion;
  reflections: Reflection[];
};

export type GenerateInput = {
  goal: Goal;
  history: HistoryItem[];
  date: string;
  contextBlocks?: ContextBlock[];
  model?: string;
  /**
   * Called with a short, human-readable phrase whenever the underlying agent
   * changes what it's doing (starts a web search, fetches a page, begins
   * drafting). Used to power per-row "what's happening" placeholders.
   */
  onStatus?: (label: string) => void;
};

export async function generateSuggestion(input: GenerateInput): Promise<SuggestionDraft> {
  const prompt = buildPrompt(input);
  const raw = await runClaude({
    prompt,
    model: input.model ?? DEFAULT_MODEL,
    allowedTools: ["WebSearch"],
    onEvent: input.onStatus ? makeStatusTranslator(input.onStatus) : undefined
  });

  return parseDraft(raw);
}

function makeStatusTranslator(
  onStatus: (label: string) => void
): (event: ClaudeStreamEvent) => void {
  let sawFirstTextAfterTool = false;
  let toolTurns = 0;

  return (event) => {
    if (event.type === "system") {
      // CLI is initialized and the agent is starting.
      onStatus("Reading your goal…");
      return;
    }

    if (event.type === "assistant") {
      const content = (event as { message?: { content?: Array<Record<string, unknown>> } })
        .message?.content;
      if (!Array.isArray(content)) return;

      for (const block of content) {
        const blockType = block.type;
        if (blockType === "tool_use") {
          toolTurns++;
          const name = typeof block.name === "string" ? block.name : "";
          const inputObj = (block.input ?? {}) as Record<string, unknown>;

          if (name === "WebSearch") {
            const q = typeof inputObj.query === "string" ? inputObj.query.trim() : "";
            onStatus(q ? `Searching: ${truncate(q, 48)}` : "Searching the web…");
          } else if (name === "WebFetch") {
            const url = typeof inputObj.url === "string" ? inputObj.url : "";
            const host = hostnameOf(url);
            onStatus(host ? `Reading ${host}…` : "Fetching a source…");
          } else if (name) {
            onStatus(`Running ${name}…`);
          }
        } else if (blockType === "text") {
          // The first substantive text block after at least one tool call
          // means the agent has stopped researching and started writing.
          const text = typeof block.text === "string" ? block.text.trim() : "";
          if (!text) continue;
          if (toolTurns > 0 && !sawFirstTextAfterTool) {
            sawFirstTextAfterTool = true;
            onStatus("Drafting today's action…");
          }
        }
      }
      return;
    }
    // user / result events: nothing to surface — result text is the final JSON.
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildPrompt(input: GenerateInput): string {
  const { goal, history, date, contextBlocks } = input;

  const goalBlock = [
    `Goal: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : null,
    goal.context ? `User context: ${goal.context}` : null,
    `Today's date: ${date}`
  ]
    .filter(Boolean)
    .join("\n");

  const historyBlock = history.length
    ? history.map(formatHistoryItem).join("\n")
    : "(none yet — this is the first suggestion for this goal)";

  const contextSection = contextBlocks?.length
    ? `\n\n## Context\n\n${contextBlocks
        .map((b) => `### ${b.label}\n${b.body}`)
        .join("\n\n")}`
    : "";

  return `${SYSTEM_INSTRUCTIONS}

---
${contextSection}

## Goal

${goalBlock}

## Recent history (don't repeat these)

${historyBlock}

Generate one suggestion now.`;
}

function formatHistoryItem({ suggestion: s, reflections }: HistoryItem): string {
  const ratingMark = s.rating === "up" ? "👍 " : s.rating === "down" ? "👎 " : "";
  const head =
    `- ${s.date} [${s.status}] ${ratingMark}${s.title}` +
    (s.resourceUrl ? ` (${s.resourceUrl})` : "");
  if (reflections.length === 0) return head;
  const notes = reflections
    .map((r) => `  ↳ "${r.text.replace(/\s+/g, " ").trim()}"`)
    .join("\n");
  return `${head}\n${notes}`;
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
