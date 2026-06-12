import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["title", "w", "h"]);

// PATCH: update title / default size. (HTML is immutable once generated; regenerate to change.)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (sets.length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  sets.push("updated_ts = ?");
  vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE custom_widgets SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  const row = db.prepare("SELECT * FROM custom_widgets WHERE id = ?").get(id);
  return NextResponse.json({ widget: row });
}

// DELETE: soft-archive (SOUL: no hard deletes).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  db.prepare("UPDATE custom_widgets SET archived_at = ?, updated_ts = ? WHERE id = ?").run(
    Date.now(),
    Date.now(),
    id,
  );
  return NextResponse.json({ ok: true });
}
