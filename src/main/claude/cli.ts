import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ClaudeStreamEvent =
  | { type: "system"; subtype?: string; [key: string]: unknown }
  | {
      type: "assistant";
      message: { content: Array<Record<string, unknown>> };
      [key: string]: unknown;
    }
  | {
      type: "user";
      message: { content: Array<Record<string, unknown>> };
      [key: string]: unknown;
    }
  | { type: "result"; subtype?: string; is_error?: boolean; result: string }
  | { type: string; [key: string]: unknown };

export type ClaudeOptions = {
  prompt: string;
  model?: string;
  allowedTools?: string[];
  /** Bytes; default 16 MB to comfortably hold a long detail markdown response. */
  maxBuffer?: number;
  /** Override path to the claude binary (defaults to whatever's on PATH). */
  binary?: string;
  /**
   * When provided, the CLI is invoked in stream-json mode and each parsed
   * event is forwarded here as it arrives. The final assistant text is still
   * returned from `runClaude` (extracted from the "result" event).
   */
  onEvent?: (event: ClaudeStreamEvent) => void;
};

type ClaudeJsonResult = {
  type: "result";
  subtype: string;
  is_error?: boolean;
  result: string;
  session_id?: string;
  num_turns?: number;
};

export class ClaudeCliError extends Error {
  constructor(message: string, readonly raw?: string) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

/**
 * Run `claude -p` and return the assistant's textual result.
 * Uses --output-format json so we get a structured wrapper around the result.
 */
export async function runClaude(opts: ClaudeOptions): Promise<string> {
  const streaming = typeof opts.onEvent === "function";

  const args: string[] = [
    "-p",
    opts.prompt,
    "--output-format",
    streaming ? "stream-json" : "json",
    "--permission-mode",
    "bypassPermissions"
  ];
  if (streaming) args.push("--verbose");

  if (opts.model) args.push("--model", opts.model);
  if (opts.allowedTools?.length) {
    args.push("--allowed-tools", opts.allowedTools.join(" "));
  }

  // Resolution order:
  //   1. explicit opts.binary
  //   2. CLAUDE_BIN env var (set in .env.local for packaged installs)
  //   3. "claude" on PATH — works in dev terminal, often broken in a .app
  //      launched from Finder because macOS GUI apps inherit a minimal PATH
  //      that doesn't include ~/.local/bin, /opt/homebrew/bin, etc.
  const binary = opts.binary ?? process.env.CLAUDE_BIN ?? "claude";
  const maxBuffer = opts.maxBuffer ?? 16 * 1024 * 1024;

  // Augment PATH so `claude` (if it shells out to node, npx, etc.) can find
  // its tools when running from a packaged .app.
  const augmentedPath = [
    process.env.PATH,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${process.env.HOME ?? ""}/.local/bin`
  ]
    .filter(Boolean)
    .join(":");

  const env = { ...process.env, PATH: augmentedPath };

  if (streaming) {
    return runClaudeStreaming(binary, args, env, opts.onEvent!);
  }

  let stdout: string;
  try {
    const result = await execFileAsync(binary, args, { maxBuffer, env });
    stdout = result.stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new ClaudeCliError(
      `claude CLI failed (binary=${binary}): ${e.message}${e.stderr ? `\n${e.stderr}` : ""}`,
      e.stdout
    );
  }

  let parsed: ClaudeJsonResult;
  try {
    parsed = JSON.parse(stdout) as ClaudeJsonResult;
  } catch {
    throw new ClaudeCliError(`claude CLI returned non-JSON output`, stdout);
  }

  if (parsed.is_error) {
    throw new ClaudeCliError(`claude CLI reported an error: ${parsed.result}`, stdout);
  }

  return parsed.result;
}

function runClaudeStreaming(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  onEvent: (event: ClaudeStreamEvent) => void
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(binary, args, { env });

    let buffer = "";
    let stderrBuf = "";
    let finalResult: string | undefined;
    let finalIsError = false;

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let event: ClaudeStreamEvent;
        try {
          event = JSON.parse(line) as ClaudeStreamEvent;
        } catch {
          continue;
        }
        if (event.type === "result") {
          const r = event as { result: string; is_error?: boolean };
          finalResult = r.result;
          finalIsError = !!r.is_error;
        }
        try {
          onEvent(event);
        } catch (err) {
          console.error("[claude/cli] onEvent threw:", err);
        }
      }
    });

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      stderrBuf += chunk;
    });

    proc.on("error", (err) => {
      reject(new ClaudeCliError(`claude CLI spawn failed (binary=${binary}): ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0 && finalResult === undefined) {
        reject(
          new ClaudeCliError(
            `claude CLI exited with code ${code}${stderrBuf ? `\n${stderrBuf}` : ""}`
          )
        );
        return;
      }
      if (finalIsError) {
        reject(new ClaudeCliError(`claude CLI reported an error: ${finalResult ?? ""}`));
        return;
      }
      if (finalResult === undefined) {
        reject(new ClaudeCliError(`claude CLI completed without a result event`));
        return;
      }
      resolve(finalResult);
    });
  });
}
