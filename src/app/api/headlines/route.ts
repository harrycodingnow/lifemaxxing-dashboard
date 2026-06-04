import { NextResponse } from "next/server";

export const revalidate = 0;

type Headline = { title: string; link: string; source: string };

let cache: { at: number; data: Headline[] } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

const FEEDS: { url: string; source: string }[] = [
  { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", source: "WSJ" },
  { url: "https://finance.yahoo.com/news/rssindex", source: "Yahoo" },
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

export function parseRss(xml: string, source: string, limit = 5): Headline[] {
  const items: Headline[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const title = extract("title", block);
    const link = extract("link", block);
    if (title) items.push({ title, link, source });
  }
  return items;
}

async function fetchOne(url: string, source: string): Promise<Headline[]> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (lifemaxxing-dashboard)",
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.5",
      },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml, source, 5);
  } catch {
    return [];
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json({ headlines: cache.data, cached: true });
  }
  const results = await Promise.all(FEEDS.map((f) => fetchOne(f.url, f.source)));
  // Interleave so we get a mix of sources
  const merged: Headline[] = [];
  const maxLen = Math.max(...results.map((r) => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const r of results) {
      if (r[i]) merged.push(r[i]);
    }
  }
  const top = merged.slice(0, 8);
  if (top.length > 0) cache = { at: now, data: top };
  return NextResponse.json({ headlines: top, cached: false });
}
