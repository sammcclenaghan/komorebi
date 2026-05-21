import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Link2, X } from "lucide-react";
import { cn } from "~/lib/cn";
import type { IntegrationView } from "~/main/integrations/service";

type Props = { view: IntegrationView };

export function IntegrationCard({ view }: Props) {
  const { toolkit, status } = view;
  const queryClient = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const connect = useMutation({
    mutationFn: async () => {
      setWaiting(true);
      try {
        await window.komorebi.integrations.beginConnect(toolkit.slug);
        await window.komorebi.integrations.awaitConnect(toolkit.slug);
      } finally {
        setWaiting(false);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    }
  });

  const disconnect = useMutation({
    mutationFn: () => window.komorebi.integrations.disconnect(toolkit.slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    }
  });

  const isConnected = status === "connected";
  const isUnsupported = status === "unsupported";
  const isBusy = waiting || connect.isPending;
  const primaryScheme = toolkit.managedAuthSchemes[0] ?? toolkit.authSchemes[0];

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-[var(--color-canvas)] p-5 transition-all duration-200",
        "hover:border-[var(--color-rule-2)] hover:shadow-[0_1px_2px_oklch(20%_0.01_60/0.04),0_4px_12px_-2px_oklch(20%_0.01_60/0.06)]",
        isConnected
          ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-tint)]"
          : "border-[var(--color-rule)]"
      )}
    >
      <div className="flex items-start gap-3">
        {toolkit.logo && !imgError ? (
          <img
            src={toolkit.logo}
            alt=""
            onError={() => setImgError(true)}
            loading="lazy"
            className={cn(
              "h-10 w-10 shrink-0 rounded-lg object-cover ring-1 transition",
              isConnected
                ? "ring-[var(--color-accent)]/30"
                : "ring-[var(--color-rule)] group-hover:ring-[var(--color-rule-2)]"
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 font-mono text-[11px] tracking-wider",
              "bg-[var(--color-panel)] text-[var(--color-ink-3)]",
              isConnected
                ? "ring-[var(--color-accent)]/30"
                : "ring-[var(--color-rule)]"
            )}
          >
            {toolkit.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-medium leading-tight text-[var(--color-ink)]">
            {toolkit.name}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--color-ink-3)]">
            {isConnected ? (
              <>
                <span className="inline-flex h-1.5 w-1.5 animate-[pulse-soft_2.4s_ease-in-out_infinite] rounded-full bg-[var(--color-accent)]" />
                <span className="font-mono uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                  connected
                </span>
              </>
            ) : isUnsupported ? (
              <span className="font-mono uppercase tracking-[0.16em] opacity-60">
                unsupported
              </span>
            ) : toolkit.noAuth ? (
              <span className="font-mono uppercase tracking-[0.16em]">no auth</span>
            ) : primaryScheme ? (
              <span className="font-mono uppercase tracking-[0.16em]">{primaryScheme}</span>
            ) : null}
          </div>
        </div>
      </div>

      {toolkit.description && (
        <p className="mt-4 line-clamp-2 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
          {toolkit.description}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {toolkit.categories.slice(0, 2).map((c) => (
            <span
              key={c}
              className="rounded-sm border border-[var(--color-rule)] bg-[var(--color-panel)] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-ink-3)]"
            >
              {c}
            </span>
          ))}
        </div>

        {isConnected ? (
          <button
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px]",
              "text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]",
              "disabled:opacity-50"
            )}
          >
            {disconnect.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" strokeWidth={2} />
            )}
            Disconnect
          </button>
        ) : isUnsupported ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
            no managed auth
          </span>
        ) : isBusy ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-accent-strong)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting on browser…
          </span>
        ) : (
          <button
            onClick={() => connect.mutate()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium",
              "bg-[var(--color-ink)] text-[var(--color-canvas)]",
              "transition-colors hover:bg-[var(--color-accent)]"
            )}
          >
            <Link2 className="h-3 w-3" strokeWidth={2.5} />
            Connect
          </button>
        )}
      </div>
    </article>
  );
}
