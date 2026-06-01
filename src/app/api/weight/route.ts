import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WeightRow = { id: number; ts: number; weight_kg: number; note: string | null };

export async function GET(req: NextRequest) {
  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("days") || 90)));
  const since = Date.now() - days * 24 * 3600 * 1000;
  const rows = db
    .prepare("SELECT id, ts, weight_kg, note FROM weights WHERE ts >= ? ORDER BY ts ASC")
    .all(since) as WeightRow[];

  const latest = rows.length ? rows[rows.length - 1] : null;
  const earliest = rows.length ? rows[0] : null;
  const min = rows.reduce((a, r) => Math.min(a, r.weight_kg), Infinity);
  const max = rows.reduce((a, r) => Math.max(a, r.weight_kg), -Infinity);

  // 7-day moving average (over time, not over samples)
  const movingAvg7d = rows.map((r) => {
    const start = r.ts - 7 * 24 * 3600 * 1000;
    const window = rows.filter((x) => x.ts >= start && x.ts <= r.ts);
    const avg = window.reduce((a, b) => a + b.weight_kg, 0) / window.length;
    return { ts: r.ts, weight_kg: +avg.toFixed(2) };
  });

  return NextResponse.json({
    range_days: days,
    rows,
    moving_avg_7d: movingAvg7d,
    stats: {
      count: rows.length,
      latest_kg: latest?.weight_kg ?? null,
      latest_ts: latest?.ts ?? null,
      earliest_kg: earliest?.weight_kg ?? null,
      delta_kg: latest && earliest ? +(latest.weight_kg - earliest.weight_kg).toFixed(2) : null,
      min_kg: isFinite(min) ? min : null,
      max_kg: isFinite(max) ? max : null,
    },
  });
}
