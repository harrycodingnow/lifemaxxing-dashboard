import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") || "30", 10)));
  const since = Date.now() - days * 86400 * 1000;
  const rows = db
    .prepare(
      `SELECT id, ts, meal_type, description, calories, protein_g, carbs_g, fat_g
       FROM meals WHERE ts >= ? AND deleted_at IS NULL ORDER BY ts DESC`,
    )
    .all(since);
  return NextResponse.json({ rows });
}
