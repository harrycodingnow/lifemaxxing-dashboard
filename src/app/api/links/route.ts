import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { extractFirstUrl, fetchLinkMeta } from "@/lib/links";

export const dynamic = "force-dynamic";

type SavedLinkRow = {
  id: number;
  added_at: number;
  url: string;
  kind: string;
  title: string | null;
  description: string | null;
  author: string | null;
  site_name: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: string;
  note: string | null;
  opened_at: number | null;
};

// GET /api/links?status=unread|reading|done|all&limit=50
// Default: status=unread, limit=50, archived rows always excluded.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "unread";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

  let sql = `SELECT id, added_at, url, kind, title, description, author, site_name,
                    thumbnail_url, duration_seconds, status, note, opened_at
             FROM saved_links WHERE archived_at IS NULL`;
  const params: (string | number)[] = [];
  if (statusFilter !== "all") {
    sql += ` AND status = ?`;
    params.push(statusFilter);
  }
  sql += ` ORDER BY added_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as SavedLinkRow[];
  return NextResponse.json({ rows });
}

// POST /api/links { text?: string; url?: string; note?: string }
//   - If 'url' is passed, use it directly.
//   - Otherwise extract the first URL from 'text' (anywhere in the string).
//   - Returns { kind: "link.saved", row } or { error } on no-url.
//   - Idempotent on URL: if the same URL was saved already and is still
//     unarchived, we return the existing row instead of duplicating.
export async function POST(req: NextRequest) {
  let body: { text?: string; url?: string; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const inputUrl = (body.url || "").trim();
  const text = (body.text || "").trim();
  const url = inputUrl || extractFirstUrl(text);
  if (!url) return NextResponse.json({ error: "no URL found in body" }, { status: 400 });

  // If we extracted from text, the leftover (after stripping the URL) becomes
  // the user's note. Explicit body.note wins.
  let note = body.note || null;
  if (!note && text) {
    const leftover = text.replace(url, "").trim();
    if (leftover && leftover.length <= 500) note = leftover;
  }

  // Idempotent check.
  const existing = db.prepare(
    `SELECT id, added_at, url, kind, title, description, author, site_name,
            thumbnail_url, duration_seconds, status, note, opened_at
     FROM saved_links
     WHERE url = ? AND archived_at IS NULL`,
  ).get(url) as SavedLinkRow | undefined;
  if (existing) {
    return NextResponse.json({ kind: "link.saved", row: existing, duplicate: true });
  }

  const meta = await fetchLinkMeta(url);

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO saved_links (
      added_at, url, kind, title, description, author, site_name,
      thumbnail_url, duration_seconds, status, note, raw_meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)
  `);
  const info = stmt.run(
    now,
    meta.url,
    meta.kind,
    meta.title,
    meta.description,
    meta.author,
    meta.site_name,
    meta.thumbnail_url,
    meta.duration_seconds,
    note,
    JSON.stringify(meta.raw),
  );
  const row = db.prepare(
    `SELECT id, added_at, url, kind, title, description, author, site_name,
            thumbnail_url, duration_seconds, status, note, opened_at
     FROM saved_links WHERE id = ?`,
  ).get(info.lastInsertRowid) as SavedLinkRow;

  return NextResponse.json({ kind: "link.saved", row });
}
