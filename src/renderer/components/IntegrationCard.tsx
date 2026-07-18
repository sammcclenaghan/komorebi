import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Link2, X } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "./ui/Button";
import type { IntegrationView } from "~/shared/schema";

type Props = { view: IntegrationView };

/** How long to wait for the OAuth round-trip before offering a retry. */
const CONNECT_WAIT_MS = 120_000;

export function IntegrationCard({ view }: Props) {
  const { toolkit, status } = view;
  const queryClient = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  // Resolves the race below early when the user gives up on the browser flow.
  const cancelWaitRef = useRef<(() => void) | null>(null);

  const connect = useMutation({
    mutationFn: async () => {
      setWaiting(true);
      setNotice(null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await window.komorebi.integrations.beginConnect(toolkit.slug);
        await Promise.race([
          window.komorebi.integrations.awaitConnect(toolkit.slug),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Didn't complete in time — try again.")),
              CONNECT_WAIT_MS
            );
            cancelWaitRef.current = () => {
              clearTimeout(timer);
              reject(new Error("cancelled"));
            };
          })
        ]);
      } finally {
        // Clear the timer in every outcome — success, timeout, cancel, error —
        // so a successful connect doesn't leave a stray rejection timer running.
        clearTimeout(timer);
        cancelWaitRef.current = null;
        setWaiting(false);
      }
    },
    onError: (err) => {
      if ((err as Error).message !== "cancelled") {
        setNotice((err as Error).message || "Connection failed — try again.");
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
  const primaryScheme = toolkit.managedAuthSchemes[0] ?? toolkit.authSchemes[0];

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-[var(--color-canvas)] p-5 transition-all duration-200",
        "hover:border-[var(--color-rule-2)] hover:shadow-[0_1px_2px_color-mix(in_oklab,var(--color-shadow)_4%,transparent),0_4px_12px_-2px_color-mix(in_oklab,var(--color-shadow)_6%,transparent)]",
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
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 font-mono text-xs tracking-wider",
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
          <h3 className="truncate text-lg font-medium leading-tight text-[var(--color-ink)]">
            {toolkit.name}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-[var(--color-ink-3)]">
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
        <p className="mt-4 line-clamp-2 text-sm leading-snug text-[var(--color-ink-2)]">
          {toolkit.description}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {toolkit.categories.slice(0, 2).map((c) => (
            <span
              key={c}
              className="rounded-sm border border-[var(--color-rule)] bg-[var(--color-panel)] px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-[var(--color-ink-3)]"
            >
              {c}
            </span>
          ))}
        </div>

        {isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" strokeWidth={2} />
            )}
            Disconnect
          </Button>
        ) : isUnsupported ? (
          <span className="font-mono text-2xs uppercase tracking-wider text-[var(--color-ink-3)]">
            no managed auth
          </span>
        ) : waiting ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent-strong)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting on browser…
            </span>
            <Button variant="ghost" size="sm" onClick={() => cancelWaitRef.current?.()}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" onClick={() => connect.mutate()}>
            <Link2 className="h-3 w-3" strokeWidth={2.5} />
            Connect
          </Button>
        )}
      </div>

      {notice && (
        <p className="mt-3 text-right text-xs text-[var(--color-danger)]">{notice}</p>
      )}
    </article>
  );
}
