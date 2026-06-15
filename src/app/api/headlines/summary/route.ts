import { NextRequest, NextResponse } from "next/server";
import { fetchHeadlines, parseCategoryParam } from "@/app/api/headlines/route";
import { hermesCall } from "@/lib/hermes";
import { NEWS_SUMMARY_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache the LLM summary per-category (LLM calls are slow + costly). The
// underlying headlines refresh every 10min, so a 10min summary cache matches.
// Multi-category filters (?category=tech,markets) get their own cache slot via
// a sorted comma-joined key.
const cache = new Map<string, { at: number; summary: string }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("category");
  const wanted = parseCategoryParam(raw);
  const key = wanted ? Array.from(wanted).sort().join(",") : "all";
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json({ summary: hit.summary, cached: true, category: raw || null });
  }

  let all;
  try {
    all = await fetchHeadlines();
  } catch (e) {
    return NextResponse.json({ summary: null, error: `headlines fetch failed: ${(e as Error).message}` });
  }

  const headlines = wanted ? all.filter((h) => wanted.has(h.category.toLowerCase())) : all;
  if (headlines.length === 0) {
    return NextResponse.json({ summary: null, error: "no headlines to summarize", category: raw || null });
  }

  // Compact payload: only what the model needs (title/source/category).
  const compact = headlines.map((h) => ({ title: h.title, source: h.source, category: h.category }));

  try {
    const out = await hermesCall(NEWS_SUMMARY_PROMPT(JSON.stringify(compact, null, 2)), { timeoutMs: 120_000 });
    const summary = out.trim();
    if (summary) cache.set(key, { at: now, summary });
    return NextResponse.json({ summary, cached: false, category: raw || null, count: headlines.length });
  } catch (e) {
    return NextResponse.json({ summary: null, error: (e as Error).message, category: raw || null });
  }
}
