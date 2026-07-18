import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Theme } from "~/shared/schema";

/**
 * Read the user's theme preference from settings and apply it to
 * `<html data-theme="…">`. When the preference is `"system"`, follow
 * the OS appearance and react to changes live.
 */
export function useApplyTheme(): void {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.komorebi.settings.get()
  });

  const preference: Theme = settingsQuery.data?.theme ?? "system";

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const resolved =
        preference === "system" ? (mql.matches ? "dark" : "light") : preference;
      document.documentElement.dataset.theme = resolved;

      // Status bar / browser chrome follows the canvas. Read the resolved
      // color from the DOM rather than duplicating token values here.
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) {
        const bg = getComputedStyle(document.body).backgroundColor;
        if (bg) meta.content = bg;
      }
    }

    apply();

    if (preference !== "system") return;
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [preference]);
}
