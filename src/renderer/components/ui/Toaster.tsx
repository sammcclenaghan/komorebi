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
      closeButton
      toastOptions={{
        style: {
          // Map Sonner's surface tokens onto Geist's, so a toast is the same
          // object as a menu or a modal: hairline border, whisper of shadow.
          "--normal-bg": "var(--color-background-100)",
          "--normal-border": "var(--color-alpha-400)",
          "--normal-text": "var(--color-gray-1000)",
          "--success-bg": "var(--color-background-100)",
          "--success-border": "var(--color-alpha-400)",
          "--success-text": "var(--color-gray-1000)",
          "--error-bg": "var(--color-red-100)",
          "--error-border": "var(--color-red-400)",
          "--error-text": "var(--color-red-900)",
          borderRadius: "8px",
          boxShadow: "var(--shadow-menu)",
          fontSize: "14px",
          lineHeight: "20px"
        } as React.CSSProperties
      }}
    />
  );
}
