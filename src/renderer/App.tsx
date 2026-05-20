import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { cn } from "~/lib/cn";

export function App() {
  const versionQuery = useQuery({
    queryKey: ["app", "version"],
    queryFn: () => window.goalpath.getVersion()
  });

  return (
    <main className="mx-auto max-w-2xl px-8 py-12">
      <header className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-indigo-500" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Goalpath</h1>
      </header>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Electron + React + TypeScript + Tailwind shell.
      </p>

      <section
        className={cn(
          "mt-8 rounded-lg border border-neutral-200 bg-white p-4 text-sm",
          "dark:border-neutral-800 dark:bg-neutral-900"
        )}
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-neutral-500">App version</dt>
          <dd className="font-mono">
            {versionQuery.isPending ? "…" : versionQuery.data}
          </dd>
        </dl>
      </section>
    </main>
  );
}
