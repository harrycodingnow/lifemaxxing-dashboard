import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

type Headline = { title: string; link: string; source: string; category: string };

let cache: { at: number; data: Headline[] } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Category-tagged feeds. Direct publisher RSS where available (clean links),
// plus Google News topic/geo feeds for variety. Google News <link> values are
// opaque CBMi... redirectors, but they resolve to the publisher when clicked in
// a browser, so they're fine for a click-through marquee/news panel.
type Feed = { url: string; source: string; category: string; gnews?: boolean; limit?: number };
const FEEDS: Feed[] = [
  { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", source: "WSJ", category: "Markets", limit: 4 },
  { url: "https://finance.yahoo.com/news/rssindex", source: "Yahoo Finance", category: "Markets", limit: 4 },
  { url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "World", gnews: true, limit: 4 },
  { url: "https://news.google.com/rss/headlines/section/topic/POLITICS?hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "Politics", gnews: true, limit: 4 },
  { url: "https://techcrunch.com/feed/", source: "TechCrunch", category: "Tech", limit: 3 },
  { url: "https://feeds.arstechnica.com/arstechnica/index", source: "Ars Technica", category: "Tech", limit: 3 },
  { url: "https://www.engadget.com/rss.xml", source: "Engadget", category: "Tech", limit: 2 },
  { url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "Tech", gnews: true, limit: 2 },
  { url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "Business", gnews: true, limit: 3 },
  { url: "https://news.google.com/rss/headlines/section/geo/Taiwan?hl=zh-TW&gl=TW&ceid=TW:zh-Hant", source: "Google News", category: "Taiwan", gnews: true, limit: 5 },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extract(tag: string, block: string): string {
  // Try CDATA first, then plain
  const cdata = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i").exec(block);
  if (cdata) return decodeEntities(cdata[1].trim());
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (plain) return decodeEntities(plain[1].trim());
  return "";
}

export function parseRss(
  xml: string,
  source: string,
  limit = 5,
  opts: { category?: string; gnews?: boolean } = {},
): Headline[] {
  const category = opts.category ?? "News";
  const items: Headline[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    let title = extract("title", block);
    const link = extract("link", block);
    if (!title) continue;
    // Google News items embed the publisher in a <source> tag and append
    // " - Publisher" to the title. Prefer the real publisher and clean the title.
    let itemSource = source;
    if (opts.gnews) {
      const src = extract("source", block);
      if (src) {
        itemSource = src;
        // Strip a trailing " - Publisher" that matches the source.
        const suffix = ` - ${src}`;
        if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
      }
      // Fallback: strip any trailing " - X" segment Google appends.
      else {
        const dash = title.lastIndexOf(" - ");
        if (dash > 20) {
          itemSource = title.slice(dash + 3).trim();
          title = title.slice(0, dash).trim();
        }
      }
    }
    if (title) items.push({ title, link, source: itemSource, category });
  }
  return items;
}

async function fetchOne(feed: Feed): Promise<Headline[]> {
  try {
    const r = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (lifemaxxing-dashboard)",
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.5",
      },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml, feed.source, feed.limit ?? 5, { category: feed.category, gnews: feed.gnews });
  } catch {
    return [];
  }
}

// Fetch + merge all feeds (round-robin for category variety), with caching.
// Exported so the news-summary route can reuse the same data without re-defining feeds.
export async function fetchHeadlines(): Promise<Headline[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  const results = await Promise.all(FEEDS.map((f) => fetchOne(f)));
  const merged: Headline[] = [];
  const maxLen = Math.max(...results.map((r) => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const r of results) {
      if (r[i]) merged.push(r[i]);
    }
  }
  const data = merged.slice(0, 32);
  if (data.length > 0) cache = { at: now, data };
  return data;
}

// Parse a ?category= value that may be a single name or a comma-separated list
// (e.g. "tech,markets" — used by the dashboard's "Focus" chip). Returns the
// normalized lowercase set, or null when no filter was supplied.
export function parseCategoryParam(raw: string | null | undefined): Set<string> | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const parts = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  return new Set(parts);
}

export async function GET(req: NextRequest) {
  // Optional ?category= filter (case-insensitive). Default: a mix of all.
  // Comma-separated values are accepted: ?category=tech,markets.
  const wanted = parseCategoryParam(req?.nextUrl?.searchParams.get("category"));

  const now = Date.now();
  const data = await fetchHeadlines();

  const headlines = wanted
    ? data.filter((h) => wanted.has(h.category.toLowerCase()))
    : data;
  // Distinct categories present (for a UI filter chip row).
  const categories = Array.from(new Set(data.map((h) => h.category)));
  return NextResponse.json({ headlines, categories, cached: !!cache && now - cache.at < TTL_MS });
}
