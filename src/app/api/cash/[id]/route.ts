import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["name", "balance", "currency", "kind", "sort_order", "archived_at"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const cId = parseInt(id, 10);
  if (!Number.isFinite(cId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json()) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  sets.push("updated_ts = ?");
  vals.push(Date.now());
  vals.push(cId);
  const info = db.prepare(`UPDATE cash_accounts SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = db.prepare("SELECT * FROM cash_accounts WHERE id = ?").get(cId);
  return NextResponse.json({ row });
}

// Soft-archive only (no hard delete per SOUL.md).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const cId = parseInt(id, 10);
  if (!Number.isFinite(cId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE cash_accounts SET archived_at = ?, updated_ts = ? WHERE id = ? AND archived_at IS NULL")
    .run(Date.now(), Date.now(), cId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: true });
}
