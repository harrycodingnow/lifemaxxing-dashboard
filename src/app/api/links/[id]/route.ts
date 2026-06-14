import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["unread", "reading", "done"]);

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/links/[id]
// Body: { status?: 'unread'|'reading'|'done'; note?: string; archive?: true }
// Returns the updated row (or 404 if missing / already archived).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const linkId = parseInt(id, 10);
  if (!Number.isFinite(linkId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* keep empty body for archive-only via DELETE */ }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.status === "string") {
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: `bad status; must be one of ${[...VALID_STATUS].join("|")}` }, { status: 400 });
    }
    sets.push("status = ?");
    vals.push(body.status);
    if (body.status === "reading" || body.status === "done") {
      sets.push("opened_at = COALESCE(opened_at, ?)");
      vals.push(Date.now());
    }
  }
  if (typeof body.note === "string") {
    sets.push("note = ?");
    vals.push(body.note.slice(0, 1000));
  }
  if (body.archive === true) {
    sets.push("archived_at = ?");
    vals.push(Date.now());
  }
  if (!sets.length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

  vals.push(linkId);
  const info = db
    .prepare(`UPDATE saved_links SET ${sets.join(", ")} WHERE id = ? AND archived_at IS NULL`)
    .run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = db.prepare(
    `SELECT id, added_at, url, kind, title, description, author, site_name,
            thumbnail_url, duration_seconds, status, note, opened_at, archived_at
     FROM saved_links WHERE id = ?`,
  ).get(linkId);
  return NextResponse.json({ row });
}

// Soft-delete (archive) — per SOUL no hard row deletion.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const linkId = parseInt(id, 10);
  if (!Number.isFinite(linkId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE saved_links SET archived_at = ? WHERE id = ? AND archived_at IS NULL")
    .run(Date.now(), linkId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, soft: true });
}
