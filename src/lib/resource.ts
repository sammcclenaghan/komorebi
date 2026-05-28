/**
 * Classify a suggestion's `resourceUrl` so the UI can render it richly:
 * a known video host becomes an inline embeddable player, anything else
 * is treated as a generic link (whose OG metadata we fetch separately).
 *
 * Pure + dependency-free so it runs in both renderer and main.
 */

export type VideoProvider = "youtube" | "vimeo" | "loom";

export type ResourceMedia =
  | {
      kind: "video";
      provider: VideoProvider;
      /** URL safe to drop into an <iframe src>. */
      embedUrl: string;
      /** Poster image, when the provider exposes a stable one. */
      thumbnailUrl: string | null;
    }
  | { kind: "link" };

function youTubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id || null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([\w-]+)/);
    if (m) return m[2] ?? null;
  }
  return null;
}

function vimeoId(u: URL): string | null {
  if (u.hostname.replace(/^www\./, "") !== "vimeo.com") return null;
  return u.pathname.match(/^\/(\d+)/)?.[1] ?? null;
}

function loomId(u: URL): string | null {
  if (!/(^|\.)loom\.com$/.test(u.hostname)) return null;
  return u.pathname.match(/^\/(share|embed)\/([\w-]+)/)?.[2] ?? null;
}

export function classifyResource(rawUrl: string | null | undefined): ResourceMedia {
  if (!rawUrl) return { kind: "link" };
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { kind: "link" };
  }

  const yt = youTubeId(u);
  if (yt) {
    const start = u.searchParams.get("t") ?? u.searchParams.get("start");
    const startSeconds = start ? parseTimecode(start) : 0;
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      // Must match the Origin header we stamp in the main process so the
      // embedded player accepts the file:// app as a valid host.
      origin: "https://www.youtube.com"
    });
    if (startSeconds > 0) params.set("start", String(startSeconds));
    return {
      kind: "video",
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${yt}?${params.toString()}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
    };
  }

  const vimeo = vimeoId(u);
  if (vimeo) {
    return {
      kind: "video",
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      thumbnailUrl: null
    };
  }

  const loom = loomId(u);
  if (loom) {
    return {
      kind: "video",
      provider: "loom",
      embedUrl: `https://www.loom.com/embed/${loom}`,
      thumbnailUrl: null
    };
  }

  return { kind: "link" };
}

export function isVideoUrl(rawUrl: string | null | undefined): boolean {
  return classifyResource(rawUrl).kind === "video";
}

/** "90", "1m30s", "90s" → seconds. Used for YouTube ?t= deep links. */
function parseTimecode(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const m = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

export function prettifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname : "";
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
