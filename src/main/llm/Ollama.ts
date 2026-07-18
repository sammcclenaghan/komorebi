/**
 * Ollama chat client as an Effect service.
 *
 * Reliability model:
 *  - Every chat call passes a JSON Schema via Ollama's structured-output
 *    `format` parameter, so the server grammar-constrains decoding — the
 *    model cannot emit prose, code fences, or missing keys.
 *  - Transient transport failures (network, 5xx, timeout) retry with
 *    exponential backoff. Permanent failures (bad model tag, auth) fail
 *    immediately with the server's real error message.
 */
import { Data, Duration, Effect, Schedule } from "effect";

const LOCAL_HOST = "http://localhost:11434";
export const CLOUD_HOST = "https://ollama.com";
const DEFAULT_LOCAL_MODEL = "gpt-oss:120b-cloud";
const DEFAULT_CLOUD_MODEL = "gpt-oss:120b";

// Without a timeout, a hung host blocks the coalesced in-flight generation
// forever — the UI just shows "Composing…" until the process restarts.
const CHAT_TIMEOUT_MS = 120_000;

export class LlmError extends Data.TaggedError("LlmError")<{
  message: string;
  /** Retrying won't help (bad model tag, auth failure, 4xx). */
  permanent: boolean;
  raw?: string;
}> {}

export type ChatRequest = {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** JSON Schema for Ollama structured outputs. */
  format: object;
  temperature?: number;
};

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
  error?: string;
};

export function defaultHost(): string {
  return process.env.KOMOREBI_WEB === "1" ? CLOUD_HOST : LOCAL_HOST;
}

export function defaultModel(): string {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  return process.env.KOMOREBI_WEB === "1" ? DEFAULT_CLOUD_MODEL : DEFAULT_LOCAL_MODEL;
}

/** Pull a human-readable error out of an Ollama error body ({"error": "..."}). */
export function extractError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      const msg = (parsed.error as { message?: unknown }).message;
      if (typeof msg === "string" && msg) return msg;
    }
  } catch {
    // not JSON
  }
  return body.slice(0, 300).trim() || "no error detail";
}

const transientRetry = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(2))
);

export class Ollama extends Effect.Service<Ollama>()("Ollama", {
  succeed: {
    chat: (request: ChatRequest): Effect.Effect<string, LlmError> => {
      const attempt = Effect.tryPromise({
        try: async () => {
          const host = (process.env.OLLAMA_HOST ?? defaultHost()).replace(/\/$/, "");
          const chatApiKey = process.env.OLLAMA_CHAT_API_KEY;
          const cloudApiKey = host === CLOUD_HOST ? process.env.OLLAMA_API_KEY : undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (chatApiKey || cloudApiKey) {
            headers.Authorization = `Bearer ${chatApiKey ?? cloudApiKey}`;
          }

          let res: Response;
          try {
            res = await fetch(`${host}/api/chat`, {
              method: "POST",
              headers,
              signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
              body: JSON.stringify({
                model: request.model,
                stream: false,
                messages: [
                  { role: "system", content: request.system },
                  ...request.messages
                ],
                format: request.format,
                options: { temperature: request.temperature ?? 0.4 }
              })
            });
          } catch (err) {
            if (err instanceof Error && err.name === "TimeoutError") {
              throw new LlmError({
                message: `Ollama chat timed out after ${Math.round(CHAT_TIMEOUT_MS / 1000)}s`,
                permanent: false
              });
            }
            throw new LlmError({
              message: `Could not reach Ollama at ${host}: ${
                err instanceof Error ? err.message : String(err)
              }`,
              permanent: false
            });
          }

          const text = await res.text();
          if (!res.ok) {
            // Surface the real reason (e.g. "model 'x' not found") instead of
            // just the status code — Ollama returns it in a JSON {error} body.
            throw new LlmError({
              message: `Ollama chat failed (${res.status}): ${extractError(text)}`,
              permanent: res.status >= 400 && res.status < 500,
              raw: text
            });
          }

          let parsed: OllamaChatResponse;
          try {
            parsed = JSON.parse(text) as OllamaChatResponse;
          } catch {
            throw new LlmError({
              message: "Ollama chat returned a non-JSON envelope",
              permanent: false,
              raw: text
            });
          }
          if (parsed.error) {
            throw new LlmError({
              message: `Ollama chat error: ${parsed.error}`,
              permanent: true,
              raw: text
            });
          }

          const content = parsed.message?.content ?? parsed.response;
          if (!content) {
            throw new LlmError({
              message: "Ollama chat completed without content",
              permanent: false,
              raw: text
            });
          }
          return content;
        },
        catch: (err) =>
          err instanceof LlmError
            ? err
            : new LlmError({
                message: err instanceof Error ? err.message : String(err),
                permanent: false
              })
      });

      return attempt.pipe(
        Effect.retry({
          schedule: transientRetry,
          while: (error) => !error.permanent
        })
      );
    }
  }
}) {}
