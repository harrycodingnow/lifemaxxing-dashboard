import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const range_days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") || "90", 10)));
  const sinceTs = Date.now() - range_days * 86400_000;

  const rows = db
    .prepare("SELECT id, ts, weight_kg, note FROM weights WHERE ts >= ? AND deleted_at IS NULL ORDER BY ts ASC")
    .all(sinceTs) as Array<{ id: number; ts: number; weight_kg: number; note: string | null }>;

  // 7-day moving average across all rows in window
  const ma: { ts: number; weight_kg: number }[] = [];
  const WINDOW = 7 * 86400_000;
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i].ts;
    const start = t - WINDOW;
    let sum = 0, n = 0;
    for (let j = i; j >= 0 && rows[j].ts >= start; j--) {
      sum += rows[j].weight_kg;
      n++;
    }
    ma.push({ ts: t, weight_kg: +(sum / n).toFixed(2) });
  }

  const latest = rows.length ? rows[rows.length - 1] : null;
  const earliest = rows.length ? rows[0] : null;
  const weights = rows.map(r => r.weight_kg);

  return NextResponse.json({
    range_days,
    rows,
    moving_avg_7d: ma,
    stats: {
      count: rows.length,
      latest_kg: latest?.weight_kg ?? null,
      latest_ts: latest?.ts ?? null,
      earliest_kg: earliest?.weight_kg ?? null,
      delta_kg: latest && earliest ? +(latest.weight_kg - earliest.weight_kg).toFixed(1) : null,
      min_kg: weights.length ? Math.min(...weights) : null,
      max_kg: weights.length ? Math.max(...weights) : null,
    },
  });
}
