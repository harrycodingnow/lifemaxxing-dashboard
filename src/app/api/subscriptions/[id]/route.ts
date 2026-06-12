import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "name",
  "amount",
  "currency",
  "cycle",
  "next_charge_ts",
  "url",
  "notes",
  "sort_order",
  "archived_at",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sId = parseInt(id, 10);
  if (!Number.isFinite(sId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
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
  vals.push(sId);
  const info = db.prepare(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(sId);
  return NextResponse.json({ row });
}

// Soft-cancel only (no hard delete per SOUL.md).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sId = parseInt(id, 10);
  if (!Number.isFinite(sId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE subscriptions SET archived_at = ?, updated_ts = ? WHERE id = ? AND archived_at IS NULL")
    .run(Date.now(), Date.now(), sId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: true });
}
