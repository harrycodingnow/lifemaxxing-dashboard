import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["title", "notes", "due_ts", "priority", "done", "sort_order"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const tId = parseInt(id, 10);
  if (!Number.isFinite(tId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json()) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  // If toggling done, stamp done_ts.
  if ("done" in body) {
    sets.push("done_ts = ?");
    vals.push(body.done ? Date.now() : null);
  }
  sets.push("updated_ts = ?");
  vals.push(Date.now());
  vals.push(tId);
  const info = db
    .prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
    .run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(tId);
  return NextResponse.json({ row });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const tId = parseInt(id, 10);
  if (!Number.isFinite(tId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE todos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(Date.now(), tId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, soft: true });
}
