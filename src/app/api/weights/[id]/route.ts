import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["ts", "weight_kg", "note"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const wId = parseInt(id, 10);
  if (!Number.isFinite(wId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json()) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  vals.push(wId);
  const info = db
    .prepare(`UPDATE weights SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
    .run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = db.prepare("SELECT * FROM weights WHERE id = ?").get(wId);
  return NextResponse.json({ row });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const wId = parseInt(id, 10);
  if (!Number.isFinite(wId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE weights SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(Date.now(), wId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, soft: true });
}
