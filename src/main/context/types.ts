import type { ConnectionSummary } from "../integrations/composio";

export type ContextProviderInput = {
  userId: string;
  connection: ConnectionSummary;
};

export type ContextProvider = {
  /** The Composio toolkit slug this provider handles (e.g. "googlecalendar"). */
  toolkitSlug: string;
  /** Human-readable label that becomes the section heading in the prompt. */
  label: string;
  /**
   * Fetch context for the given user. Return a markdown body, or null if
   * nothing useful to contribute (e.g. no events today). Throwing is allowed
   * — the registry will swallow + log so one broken provider doesn't block
   * the rest.
   */
  fetch: (input: ContextProviderInput) => Promise<string | null>;
};

export type ContextBlock = {
  label: string;
  toolkitSlug: string;
  body: string;
};
