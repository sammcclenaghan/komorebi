import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Plug, AlertCircle } from "lucide-react";
import { cn } from "~/lib/cn";
import { IntegrationCard } from "../components/IntegrationCard";
import type { IntegrationView } from "~/main/integrations/service";

export function Integrations() {
  const [query, setQuery] = useState("");

  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => window.goalpath.integrations.list()
  });

  const all: IntegrationView[] = integrationsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter(
          (v) =>
            v.toolkit.name.toLowerCase().includes(q) ||
            v.toolkit.slug.toLowerCase().includes(q) ||
            (v.toolkit.description ?? "").toLowerCase().includes(q)
        )
      : all;

    return [...list].sort((a, b) => {
      if (a.status === "connected" && b.status !== "connected") return -1;
      if (b.status === "connected" && a.status !== "connected") return 1;
      return a.toolkit.name.localeCompare(b.toolkit.name);
    });
  }, [all, query]);

  return (
    <div className="mx-auto max-w-6xl px-10 pt-16 pb-20">
      <header>
        <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
          <Plug className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            integrations
          </span>
        </div>

        <h1 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
          The tools <span className="font-normal text-[var(--color-ink-2)]">Claude can use.</span>
        </h1>

        <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          Connect what you already use. Each one becomes context Claude can
          draw on when composing your daily checklist.
        </p>

        <div className="mt-8 max-w-md">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-3)]"
              strokeWidth={2}
            />
            <input
              type="search"
              autoFocus
              placeholder="Search integrations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "w-full rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] py-2 pr-3 pl-9",
                "text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)]",
                "transition focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
              )}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8">
        {integrationsQuery.isLoading ? (
          <LoadingState />
        ) : integrationsQuery.isError ? (
          <ErrorState
            message={(integrationsQuery.error as Error).message ?? "Unknown error"}
            onRetry={() => integrationsQuery.refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))"
            }}
          >
            {filtered.map((view) => (
              <IntegrationCard key={view.toolkit.slug} view={view} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))"
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[168px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)] relative overflow-hidden"
          style={{ animation: `fade-up 400ms ${i * 60}ms backwards ease-out` }}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-panel-2)] to-transparent"
            style={{
              backgroundSize: "200% 100%",
              animation: "shimmer 2.4s infinite linear"
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-accent-strong)]">
        <AlertCircle className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-[22px] font-semibold tracking-tight text-[var(--color-ink)]">
        Couldn't reach Composio.
      </h3>
      <p className="mt-3 font-mono text-[11.5px] text-[var(--color-ink-3)]">{message}</p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-md bg-[var(--color-ink)] px-4 py-2 text-[12px] text-[var(--color-canvas)] transition-colors hover:bg-[var(--color-accent)]"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="mx-auto mt-20 max-w-sm text-center">
      <h3 className="text-[22px] font-semibold tracking-tight text-[var(--color-ink)]">
        Nothing here.
      </h3>
      <p className="mt-3 text-[13px] text-[var(--color-ink-2)]">
        {query
          ? `Nothing in the catalog matches "${query}".`
          : "No integrations available."}
      </p>
    </div>
  );
}
