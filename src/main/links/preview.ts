/**
 * Fetch lightweight Open Graph / oEmbed-ish metadata for a URL so the
 * renderer can show a rich link card (thumbnail + title + description)
 * instead of a bare URL. Runs in the main process to dodge CORS, and
 * caches results in-memory for the session so repeated detail views
 * don't re-fetch.
 */

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  favicon: string | null;
};

const cache = new Map<string, LinkPreview>();
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024; // only the <head> matters; cap the read.

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const cached = cache.get(rawUrl);
  if (cached) return cached;

  const empty: LinkPreview = {
    url: rawUrl,
    title: null,
    description: null,
    imageUrl: null,
    siteName: null,
    favicon: null
  };

  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    return empty;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return empty;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some sites only emit OG tags to "real" browsers.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Komorebi/1.0",
        accept: "text/html,application/xhtml+xml"
      }
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html") || !res.body) {
      return cacheAndReturn(rawUrl, empty);
    }

    const html = await readCapped(res.body, MAX_BYTES);
    const preview = parseHead(html, base);
    return cacheAndReturn(rawUrl, preview);
  } catch (err) {
    console.warn("[link-preview] fetch failed:", rawUrl, err instanceof Error ? err.message : err);
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

function cacheAndReturn(url: string, preview: LinkPreview): LinkPreview {
  cache.set(url, preview);
  return preview;
}

/** Read a stream up to `limit` bytes, then stop — we only need <head>. */
async function readCapped(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(out)) break; // everything we want lives in <head>
  }
  void reader.cancel().catch(() => {});
  return out;
}

function parseHead(html: string, base: URL): LinkPreview {
  const meta = (...names: string[]): string | null => {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRe(name)}["'][^>]*>`,
        "i"
      );
      const tag = html.match(re)?.[0];
      if (!tag) continue;
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
      if (content) return decodeEntities(content.trim());
    }
    return null;
  };

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title =
    meta("og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag.trim()) : null);
  const description = meta("og:description", "twitter:description", "description");
  const image = meta("og:image", "og:image:url", "twitter:image", "twitter:image:src");
  const siteName = meta("og:site_name") ?? base.hostname.replace(/^www\./, "");

  return {
    url: base.toString(),
    title,
    description,
    imageUrl: image ? absolutize(image, base) : null,
    siteName,
    favicon: `https://www.google.com/s2/favicons?domain=${base.hostname}&sz=64`
  };
}

function absolutize(maybeRelative: string, base: URL): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}
