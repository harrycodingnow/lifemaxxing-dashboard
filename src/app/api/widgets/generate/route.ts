import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hermesCall } from "@/lib/hermes";
import { WIDGET_GEN_PROMPT } from "@/lib/prompts";
import type { CustomWidgetRow } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extract the last fenced ```html ... ``` block from Hermes output.
function extractHtmlBlock(text: string): string | null {
  const matches = [...text.matchAll(/```html\s*([\s\S]*?)```/gi)];
  if (matches.length) return matches[matches.length - 1][1].trim();
  // Fallback: a bare <!doctype html> ... </html> span.
  const doc = /<!doctype html>[\s\S]*<\/html>/i.exec(text);
  if (doc) return doc[0].trim();
  return null;
}

// Extract a short title from a ```json {"title": "..."} ``` block, else derive one.
function extractTitle(text: string, fallback: string): string {
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (const m of jsonBlocks) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj.title === "string" && obj.title.trim()) {
        return obj.title.trim().slice(0, 40);
      }
    } catch {
      /* try next */
    }
  }
  // Try a <title> tag inside the HTML
  const t = /<title>([^<]{1,40})<\/title>/i.exec(text);
  if (t) return t[1].trim();
  return fallback;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "empty prompt" }, { status: 400 });
  if (prompt.length > 1000) return NextResponse.json({ error: "prompt too long" }, { status: 400 });

  let raw: string;
  try {
    raw = await hermesCall(WIDGET_GEN_PROMPT(prompt), { timeoutMs: 150_000 });
  } catch (e) {
    return NextResponse.json({ error: `generation failed: ${(e as Error).message}` }, { status: 502 });
  }

  const html = extractHtmlBlock(raw);
  if (!html || !/<html[\s>]/i.test(html)) {
    return NextResponse.json(
      { error: "model did not return a valid HTML document", raw_preview: raw.slice(0, 400) },
      { status: 422 },
    );
  }
  // Defense-in-depth: the iframe sandbox (allow-scripts only, no allow-same-origin)
  // is the real boundary, but strip the most obvious foot-guns anyway.
  const cleaned = html
    .replace(/<script[^>]*\bsrc=/gi, "<script data-blocked-src=") // no external scripts
    .slice(0, 200_000); // cap size

  const title = extractTitle(raw, prompt.slice(0, 30));
  const now = Date.now();
  const info = db
    .prepare(
      "INSERT INTO custom_widgets (created_ts, updated_ts, title, prompt, html, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(now, now, title, prompt, cleaned, 4, 6);

  const row = db
    .prepare("SELECT * FROM custom_widgets WHERE id = ?")
    .get(info.lastInsertRowid) as CustomWidgetRow;

  return NextResponse.json({ widget: row });
}
