import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "ts",
  "description",
  "meal_type",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const mealId = parseInt(id, 10);
  if (!Number.isFinite(mealId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json()) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  vals.push(mealId);
  const info = db
    .prepare(`UPDATE meals SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
    .run(...vals);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = db.prepare("SELECT * FROM meals WHERE id = ?").get(mealId);
  return NextResponse.json({ row });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const mealId = parseInt(id, 10);
  if (!Number.isFinite(mealId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = db
    .prepare("UPDATE meals SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(Date.now(), mealId);
  if (info.changes === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, soft: true });
}
