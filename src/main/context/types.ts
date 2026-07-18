export type ContextBlock = {
  /** Human-readable label that becomes the section heading in the prompt. */
  label: string;
  /** The Composio toolkit slug this block came from (or a pseudo-slug). */
  toolkitSlug: string;
  /** Markdown body injected into the composer prompt. */
  body: string;
};
