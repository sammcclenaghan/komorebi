import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Theme } from "~/shared/types";

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
    }

    apply();

    if (preference !== "system") return;
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [preference]);
}
