export type ContextBlock = {
  /** Human-readable label that becomes the section heading in the prompt. */
  label: string;
  /** Which context source produced this block (e.g. "weather"). */
  source: string;
  /** Markdown body injected into the composer prompt. */
  body: string;
};
