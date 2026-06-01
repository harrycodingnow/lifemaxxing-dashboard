import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10)));
  const rows = db
    .prepare(
      `SELECT id, ts, asset_type, symbol, display_name, side, quantity, price, currency, note
       FROM trades WHERE deleted_at IS NULL ORDER BY ts DESC LIMIT ?`,
    )
    .all(limit);
  return NextResponse.json({ rows });
}
