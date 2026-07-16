import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ImageOff, Play } from "lucide-react";
import { cn } from "~/lib/cn";
import { classifyResource, prettifyUrl } from "~/lib/resource";

/**
 * Renders a suggestion's resource URL as rich media:
 *  - YouTube / Vimeo / Loom → an inline player that expands on click
 *    (poster-first so the row stays light until the user opts in).
 *  - anything else → a link-preview card with OG thumbnail + title,
 *    fetched lazily in the main process.
 */
export function MediaEmbed({ url }: { url: string }) {
  const media = classifyResource(url);
  if (media.kind === "video") {
    return <VideoEmbed url={url} embedUrl={media.embedUrl} thumbnailUrl={media.thumbnailUrl} provider={media.provider} />;
  }
  return <LinkCard url={url} />;
}

function VideoEmbed({
  url,
  embedUrl,
  thumbnailUrl,
  provider
}: {
  url: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  provider: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="relative aspect-video w-full">
        {playing ? (
          <iframe
            src={`${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
            title="Embedded video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex items-center justify-center"
            aria-label="Play video"
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ animation: "fade-up 360ms ease-out" }}
              />
            ) : (
              <div className="absolute inset-0 bg-[var(--color-panel-2)]" />
            )}
            <span className="absolute inset-0 bg-[var(--color-scrim)] transition-colors group-hover:bg-[var(--color-scrim-hover)] group-active:bg-[var(--color-scrim-active)]" />
            <span
              className={cn(
                "relative flex h-14 w-14 items-center justify-center rounded-full",
                "bg-[var(--color-canvas)]/92 text-[var(--color-ink)] shadow-lg backdrop-blur-sm",
                "transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
              )}
            >
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-[var(--color-rule)] px-3.5 py-2">
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          {provider}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="pressable inline-flex items-center gap-1 text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]"
        >
          Open
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </a>
      </figcaption>
    </figure>
  );
}

function LinkCard({ url }: { url: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => window.komorebi.links.preview(url),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const title = data?.title;
  const hasMeta = Boolean(title || data?.description || data?.imageUrl);

  // Until metadata arrives (or if there is none), fall back to the
  // compact pill the detail view used before — never a broken-looking card.
  if (isLoading || !hasMeta) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "pressable mt-5 inline-flex items-center gap-2 rounded-md border border-[var(--color-rule)] bg-[var(--color-canvas)] px-3.5 py-2",
          "text-sm text-[var(--color-ink)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-tint)]",
          "active:border-[var(--color-accent)]/40 active:bg-[var(--color-accent-tint)]",
          isLoading && "animate-pulse"
        )}
      >
        <span className="max-w-[28ch] truncate font-mono text-xs text-[var(--color-ink-2)]">
          {prettifyUrl(url)}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" strokeWidth={2} />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "pressable-row group mt-5 flex overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)]",
        "hover:border-[var(--color-rule-2)] hover:bg-[var(--color-panel-hover)]",
        "active:border-[var(--color-rule-2)] active:bg-[var(--color-panel-hover)]"
      )}
      style={{ animation: "fade-up 320ms ease-out" }}
    >
      <Thumbnail src={data?.imageUrl ?? null} />
      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          {data?.favicon && <img src={data.favicon} alt="" className="h-3 w-3 rounded-sm" />}
          <span className="truncate">{data?.siteName ?? prettifyUrl(url)}</span>
        </div>
        {title && (
          <h4 className="mt-1.5 line-clamp-2 text-base font-medium leading-snug text-[var(--color-ink)]">
            {title}
          </h4>
        )}
        {data?.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-[var(--color-ink-2)]">
            {data.description}
          </p>
        )}
      </div>
      <ArrowUpRight
        className="mr-3 mt-3 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-70"
        strokeWidth={2}
      />
    </a>
  );
}

function Thumbnail({ src }: { src: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="flex w-[120px] shrink-0 items-center justify-center bg-[var(--color-panel)] text-[var(--color-ink-3)]">
        <ImageOff className="h-5 w-5" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="w-[120px] shrink-0 overflow-hidden bg-[var(--color-panel)]">
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    </div>
  );
}
