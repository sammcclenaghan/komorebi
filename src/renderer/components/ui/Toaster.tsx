/**
 * App-themed Sonner toaster. Used for transient, non-fatal notices — e.g.
 * "web search failed, this task has no link". Hard failures render as an
 * error row instead; these are calm heads-ups.
 *
 * Rendered once near the app root. Call `toast(...)` from sonner anywhere.
 */
import { Toaster as SonnerToaster } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { Theme } from "~/shared/schema";

export function AppToaster() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.komorebi.settings.get()
  });
  const preference: Theme = settingsQuery.data?.theme ?? "system";

  return (
    <SonnerToaster
      theme={preference}
      position="bottom-center"
      // Clear the mobile nav + home indicator on phones.
      mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom) + 0.5rem)" }}
      offset={{ bottom: 20 }}
      gap={8}
      visibleToasts={3}
      toastOptions={{
        style: {
          // Map Sonner's surface tokens onto the app's palette so toasts read
          // as part of the product in both light and dark.
          "--normal-bg": "var(--color-canvas)",
          "--normal-border": "var(--color-rule)",
          "--normal-text": "var(--color-ink-2)",
          borderRadius: "12px"
        } as React.CSSProperties
      }}
    />
  );
}
