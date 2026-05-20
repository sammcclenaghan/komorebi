import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "~/lib/cn";
import { IntegrationCard } from "../components/IntegrationCard";
import type { IntegrationView } from "~/main/integrations/service";

const INITIAL_RESULT_CAP = 90;

export function Integrations() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();

  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => window.goalpath.integrations.list()
  });

  const all: IntegrationView[] = integrationsQuery.data ?? [];

  const { categories, filtered, connectedCount } = useMemo(() => {
    const catCounts = new Map<string, number>();
    for (const v of all) {
      for (const c of v.toolkit.categories) {
        catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
      }
    }

    const q = query.trim().toLowerCase();
    const filteredList = all.filter((v) => {
      if (category && !v.toolkit.categories.includes(category)) return false;
      if (!q) return true;
      return (
        v.toolkit.name.toLowerCase().includes(q) ||
        v.toolkit.slug.toLowerCase().includes(q) ||
        (v.toolkit.description ?? "").toLowerCase().includes(q)
      );
    });

    return {
      categories: [...catCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([slug]) => slug),
      filtered: filteredList,
      connectedCount: all.filter((v) => v.status === "connected").length
    };
  }, [all, query, category]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.status === "connected" && b.status !== "connected") return -1;
      if (b.status === "connected" && a.status !== "connected") return 1;
      return a.toolkit.name.localeCompare(b.toolkit.name);
    });
  }, [filtered]);

  const hasActiveFilters = query.length > 0 || category !== null;
  const shouldCap = !hasActiveFilters && !showAll && sorted.length > INITIAL_RESULT_CAP;
  const visible = shouldCap ? sorted.slice(0, INITIAL_RESULT_CAP) : sorted;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--color-rule)] px-10 pt-12 pb-7">
        <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            integrations
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
              The tools <span className="font-normal text-[var(--color-ink-2)]">Claude can use.</span>
            </h1>
            <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
              Connect what you already use. Each connected service becomes
              context Claude can draw on when composing your daily checklist.
            </p>
          </div>

          {!integrationsQuery.isLoading && (
            <div className="text-right">
              <div className="text-[34px] font-semibold leading-none tabular-nums text-[var(--color-accent-strong)]">
                {connectedCount}
              </div>
              <div className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
                connected
                <span className="mx-1.5 opacity-40">/</span>
                {all.length} available
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search
              className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-3)]"
              strokeWidth={2}
            />
            <input
              type="search"
              autoFocus
              placeholder="Search 1000+ integrations…"
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

          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["integrations"] });
              void integrationsQuery.refetch();
            }}
            disabled={integrationsQuery.isFetching}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3 py-2",
              "text-[12px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]",
              "disabled:opacity-50"
            )}
            title="Refresh from Composio"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", integrationsQuery.isFetching && "animate-spin")}
              strokeWidth={2}
            />
            Refresh
          </button>
        </div>

        {categories.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
            <CategoryChip active={category === null} onClick={() => setCategory(null)}>
              All
            </CategoryChip>
            {categories.slice(0, 18).map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                onClick={() => setCategory(c === category ? null : c)}
              >
                {c}
              </CategoryChip>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-10 py-8">
        {integrationsQuery.isLoading ? (
          <LoadingState />
        ) : integrationsQuery.isError ? (
          <ErrorState
            message={(integrationsQuery.error as Error).message ?? "Unknown error"}
            onRetry={() => integrationsQuery.refetch()}
          />
        ) : sorted.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
              <span>
                showing {visible.length} {visible.length === 1 ? "result" : "results"}
                {shouldCap && (
                  <span className="ml-1.5 opacity-70">of {sorted.length}</span>
                )}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                  }}
                  className="text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
                >
                  reset filters
                </button>
              )}
            </div>

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))"
              }}
            >
              {visible.map((view) => (
                <IntegrationCard key={view.toolkit.slug} view={view} />
              ))}
            </div>

            {shouldCap && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => setShowAll(true)}
                  className={cn(
                    "rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-2 text-[12px]",
                    "text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]"
                  )}
                >
                  Show all {sorted.length}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  children,
  active,
  onClick
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-canvas)]"
          : "border-[var(--color-rule)] bg-[var(--color-canvas)] text-[var(--color-ink-2)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))"
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
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
          : "No integrations match the current filters."}
      </p>
    </div>
  );
}
