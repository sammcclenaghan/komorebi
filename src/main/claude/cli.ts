import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ClaudeOptions = {
  prompt: string;
  model?: string;
  allowedTools?: string[];
  /** Bytes; default 16 MB to comfortably hold a long detail markdown response. */
  maxBuffer?: number;
  /** Override path to the claude binary (defaults to whatever's on PATH). */
  binary?: string;
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
  const args: string[] = [
    "-p",
    opts.prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions"
  ];

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

  let stdout: string;
  try {
    const result = await execFileAsync(binary, args, {
      maxBuffer,
      env: { ...process.env, PATH: augmentedPath }
    });
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
