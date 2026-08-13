export type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export function errorFields(cause: unknown): Record<string, unknown> {
  if (cause instanceof Error) {
    return {
      errorType: cause.name,
      error: cause.message,
      stack: cause.stack
    };
  }
  return { error: String(cause) };
}
