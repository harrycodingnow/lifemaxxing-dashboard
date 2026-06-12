import { NextRequest, NextResponse } from "next/server";
import { fetchHeadlines } from "@/app/api/headlines/route";
import { hermesCall } from "@/lib/hermes";
import { NEWS_SUMMARY_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache the LLM summary per-category (LLM calls are slow + costly). The
// underlying headlines refresh every 10min, so a 10min summary cache matches.
const cache = new Map<string, { at: number; summary: string }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const wanted = (new URL(req.url).searchParams.get("category") || "").trim().toLowerCase();
  const key = wanted || "all";
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json({ summary: hit.summary, cached: true, category: wanted || null });
  }

  let all;
  try {
    all = await fetchHeadlines();
  } catch (e) {
    return NextResponse.json({ summary: null, error: `headlines fetch failed: ${(e as Error).message}` });
  }

  const headlines = wanted ? all.filter((h) => h.category.toLowerCase() === wanted) : all;
  if (headlines.length === 0) {
    return NextResponse.json({ summary: null, error: "no headlines to summarize", category: wanted || null });
  }

  // Compact payload: only what the model needs (title/source/category).
  const compact = headlines.map((h) => ({ title: h.title, source: h.source, category: h.category }));

  try {
    const raw = await hermesCall(NEWS_SUMMARY_PROMPT(JSON.stringify(compact, null, 2)), { timeoutMs: 120_000 });
    const summary = raw.trim();
    if (summary) cache.set(key, { at: now, summary });
    return NextResponse.json({ summary, cached: false, category: wanted || null, count: headlines.length });
  } catch (e) {
    return NextResponse.json({ summary: null, error: (e as Error).message, category: wanted || null });
  }
}
