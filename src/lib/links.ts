// Best-effort link metadata fetcher. Three paths:
//   1. YouTube (youtube.com/watch?v=… or youtu.be/…) → oEmbed (free, no key,
//      returns title + author_name + thumbnail_url). Then a SECOND request to
//      noembed.com (or just plain page scrape) to get duration when we can.
//   2. Twitter/X (twitter.com, x.com) → publish.twitter.com/oembed for tweet
//      preview text. Falls back to "other".
//   3. Everything else → fetch the HTML and parse <meta property="og:*"> +
//      <title>. Capped at 256 KB so we don't slurp gigabytes of HTML.
//
// All network calls are best-effort. If anything throws or returns non-200 we
// still return a row with at least { url, kind, site_name = hostname } so the
// user gets SOMETHING saved.

export type LinkKind = "youtube" | "twitter" | "article" | "other";

export type LinkMeta = {
  url: string;            // canonical URL we stored against
  kind: LinkKind;
  title: string | null;
  description: string | null;
  author: string | null;
  site_name: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  raw: Record<string, unknown>; // raw fetched blob for forensics
};

// Conservative URL detector. Anchored to require a scheme so we don't grab
// every "a.b" looking thing in the user's chat input.
const URL_RE = /\bhttps?:\/\/[^\s)>\]]+/gi;

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  return m && m.length > 0 ? m[0].replace(/[),.;!?]+$/, "") : null;
}

/** Does this string look like ONLY a URL (possibly with surrounding whitespace
 *  / "watch later" / "save this" / etc. — short context, no other content)? */
export function looksLikeLinkSave(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  const url = extractFirstUrl(trimmed);
  if (!url) return false;
  // Strip the URL out and see what's left. If the rest is short and is one of
  // the common phrases people use for "save this for later", treat it as a
  // link save. Otherwise we need the message to be essentially just the URL.
  const rest = trimmed.replace(url, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!rest) return true;
  if (rest.length > 120) return false;
  // Common save-for-later hints across EN/中
  const hints = [
    "read later", "watch later", "save", "save this", "save for later",
    "queue", "later", "for later", "bookmark", "remind me",
    "稍後", "晚點", "之後看", "之後讀", "稍後看", "稍後讀", "存起來", "收藏",
  ];
  return hints.some((h) => rest.includes(h)) || rest.length <= 30;
}

export function detectKind(url: string): LinkKind {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") return "youtube";
    if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") return "twitter";
    return "article";
  } catch {
    return "other";
  }
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Pull <meta property="og:X" content="Y"> and <meta name="X" content="Y"> from
 *  HTML. Simple regex — good enough for ~95% of pages; we don't need a full
 *  HTML parser for read-later metadata. */
function scrapeMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  // <meta property="og:title" content="…"> OR <meta name="…" content="…">
  // Handle both orderings of attributes and both quote styles.
  const re = /<meta\s+[^>]*?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  const re2 = /<meta\s+[^>]*?content\s*=\s*["']([^"']*)["'][^>]*?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!out[m[1]]) out[m[1]] = decodeHtmlEntities(m[2]);
  }
  while ((m = re2.exec(html)) !== null) {
    if (!out[m[2]]) out[m[2]] = decodeHtmlEntities(m[1]);
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i);
  if (titleMatch) out["__title"] = decodeHtmlEntities(titleMatch[1].trim());
  return out;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function fetchText(url: string, timeoutMs = 8000, maxBytes = 256 * 1024): Promise<string> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    // Cap the read at maxBytes to avoid swallowing huge pages.
    const reader = r.body?.getReader();
    if (!reader) return await r.text();
    const decoder = new TextDecoder();
    let buf = "";
    let bytes = 0;
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      buf += decoder.decode(value, { stream: true });
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    return buf;
  } finally {
    clearTimeout(tid);
  }
}

async function fetchJSON<T = unknown>(url: string, timeoutMs = 6000): Promise<T> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(tid);
  }
}

async function fetchYouTubeMeta(url: string): Promise<LinkMeta> {
  // Free, no-key, returns title + author_name + thumbnail_url
  const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  let oembed: Record<string, unknown> = {};
  try {
    oembed = await fetchJSON<Record<string, unknown>>(oembedUrl);
  } catch {
    /* fall back to scrape */
  }

  // YouTube hides duration from oEmbed. We can try to scrape the watch page
  // for itemprop="duration" content="PT5M32S" but that often requires JS
  // execution. Best-effort: skip duration entirely if it's not in the HTML.
  let duration: number | null = null;
  try {
    const html = await fetchText(url, 6000, 128 * 1024);
    const m = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
    if (m) duration = Math.round(parseInt(m[1], 10) / 1000);
    if (!duration) {
      const iso = html.match(/itemprop="duration"\s+content="(PT[^"]+)"/);
      if (iso) duration = parseISO8601Duration(iso[1]);
    }
  } catch {
    /* duration is optional */
  }

  const title = (oembed.title as string) || null;
  const author = (oembed.author_name as string) || null;
  const thumb = (oembed.thumbnail_url as string) || `https://i.ytimg.com/vi/${extractYouTubeId(url)}/hqdefault.jpg`;

  return {
    url,
    kind: "youtube",
    title,
    description: null,
    author,
    site_name: "YouTube",
    thumbnail_url: thumb,
    duration_seconds: duration,
    raw: { oembed },
  };
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?#]+)/);
    if (m) return m[1];
  } catch { /* noop */ }
  return null;
}

function parseISO8601Duration(s: string): number | null {
  // PT1H2M3S → 3723
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (parseInt(m[1] || "0", 10) * 3600) + (parseInt(m[2] || "0", 10) * 60) + parseInt(m[3] || "0", 10);
}

async function fetchHtmlMeta(url: string, kind: LinkKind): Promise<LinkMeta> {
  let meta: Record<string, string> = {};
  try {
    const html = await fetchText(url);
    meta = scrapeMeta(html);
  } catch {
    /* return a stub below */
  }
  const title = meta["og:title"] || meta["twitter:title"] || meta["__title"] || null;
  const description = (meta["og:description"] || meta["twitter:description"] || meta["description"] || null);
  const author = meta["article:author"] || meta["author"] || meta["twitter:creator"] || null;
  const site_name = meta["og:site_name"] || safeHostname(url);
  const thumb = meta["og:image"] || meta["twitter:image"] || null;

  return {
    url,
    kind,
    title: title?.slice(0, 300) ?? null,
    description: description?.slice(0, 500) ?? null,
    author: author?.slice(0, 200) ?? null,
    site_name: site_name?.slice(0, 100) ?? null,
    thumbnail_url: thumb,
    duration_seconds: null,
    raw: meta,
  };
}

/**
 * Public: given a URL, return best-effort metadata. NEVER throws — on total
 * failure returns a stub with just url + kind + hostname.
 */
export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  const kind = detectKind(url);
  try {
    if (kind === "youtube") return await fetchYouTubeMeta(url);
    return await fetchHtmlMeta(url, kind);
  } catch {
    return {
      url,
      kind,
      title: null,
      description: null,
      author: null,
      site_name: safeHostname(url),
      thumbnail_url: null,
      duration_seconds: null,
      raw: {},
    };
  }
}

// Format a duration like 612s → "10:12", 3723 → "1:02:03"
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
