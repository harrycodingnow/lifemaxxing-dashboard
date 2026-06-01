import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { readGoals } from "@/app/api/goals/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradeRow = { ts: number; side: string; asset_type: string; symbol: string; quantity: number; price: number; currency: string };
type MealRow = { ts: number; calories: number; protein_g: number; carbs_g: number; fat_g: number };
type WeightRow = { ts: number; weight_kg: number };

function ymd(ts: number, tzOffsetMin: number): string {
  // Use local date for "day" grouping. Default tz offset = device server tz.
  const d = new Date(ts - tzOffsetMin * 60_000);
  return d.toISOString().slice(0, 10);
}

function streak(daysWithData: Set<string>, todayYmd: string): number {
  let s = 0;
  const d = new Date(todayYmd + "T00:00:00Z");
  // count back from today
  // if today has data → count today; else start from yesterday
  if (!daysWithData.has(todayYmd)) d.setUTCDate(d.getUTCDate() - 1);
  while (daysWithData.has(d.toISOString().slice(0, 10))) {
    s++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return s;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const windowDays = Math.max(1, Math.min(365, parseInt(url.searchParams.get("window") || "1", 10)));
  const tzMin = parseInt(url.searchParams.get("tz") || "0", 10); // minutes offset from UTC (e.g. -480 for UTC+8)

  const now = Date.now();
  const windowMs = now - windowDays * 86400_000;

  // ----- cash flow (sum buys − sells in USD) -----
  const trades = db
    .prepare("SELECT ts, side, asset_type, symbol, quantity, price, currency FROM trades WHERE deleted_at IS NULL AND ts >= ? ORDER BY ts ASC")
    .all(windowMs) as TradeRow[];

  // For TWD trades we need an FX rate. Reuse latest USD/TWD via env-free crude default; portfolio route caches it but we don't want a hop.
  // Use a rolling avg of NT$/USD: ~32 default if no metadata. Cache rate via settings table if available.
  let fx = 31.5;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='usd_twd_cache'").get() as { value?: string } | undefined;
    if (row?.value) {
      const n = Number(row.value);
      if (n > 20 && n < 50) fx = n;
    }
  } catch {}

  let buysUsd = 0;
  let sellsUsd = 0;
  for (const t of trades) {
    const native = t.quantity * t.price;
    const usd = t.currency === "TWD" ? native / fx : native;
    if (t.side === "buy") buysUsd += usd;
    else if (t.side === "sell") sellsUsd += usd;
  }

  // ----- streaks -----
  const todayYmd = ymd(now, tzMin);

  // meals: any meal logged that day
  const meals = db
    .prepare("SELECT ts, calories, protein_g, carbs_g, fat_g FROM meals WHERE deleted_at IS NULL ORDER BY ts DESC LIMIT 800")
    .all() as MealRow[];
  const mealDays = new Set<string>();
  const dayMacros = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
  for (const m of meals) {
    const k = ymd(m.ts, tzMin);
    mealDays.add(k);
    const cur = dayMacros.get(k) || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    cur.calories += m.calories || 0;
    cur.protein_g += m.protein_g || 0;
    cur.carbs_g += m.carbs_g || 0;
    cur.fat_g += m.fat_g || 0;
    dayMacros.set(k, cur);
  }
  const mealStreak = streak(mealDays, todayYmd);

  // protein-goal streak: days hitting protein_g goal
  const goals = readGoals();
  const proteinDays = new Set<string>();
  for (const day of Array.from(dayMacros.keys())) {
    const totals = dayMacros.get(day)!;
    if (totals.protein_g >= goals.protein_g) proteinDays.add(day);
  }
  const proteinStreak = streak(proteinDays, todayYmd);
  // protein hit count last 7 days
  let proteinHit7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayYmd + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    if (proteinDays.has(d.toISOString().slice(0, 10))) proteinHit7++;
  }

  // DCA streak: trades with note matching "daily DCA"
  const dcaRows = db
    .prepare("SELECT ts FROM trades WHERE deleted_at IS NULL AND (note LIKE '%daily DCA%' OR note LIKE '%DCA%') ORDER BY ts DESC LIMIT 400")
    .all() as Array<{ ts: number }>;
  const dcaDays = new Set<string>();
  for (const r of dcaRows) dcaDays.add(ymd(r.ts, tzMin));
  const dcaStreak = streak(dcaDays, todayYmd);

  // weigh-in streak
  const wRows = db.prepare("SELECT ts FROM weights WHERE deleted_at IS NULL ORDER BY ts DESC LIMIT 400").all() as Array<{ ts: number }>;
  const wDays = new Set<string>();
  for (const r of wRows) wDays.add(ymd(r.ts, tzMin));
  const weighStreak = streak(wDays, todayYmd);

  return NextResponse.json({
    window_days: windowDays,
    cashflow: {
      buys_usd: buysUsd,
      sells_usd: sellsUsd,
      net_usd: buysUsd - sellsUsd,
      trade_count: trades.length,
      fx_used: fx,
    },
    streaks: {
      meal_log: mealStreak,
      protein_goal: proteinStreak,
      protein_hit_last_7: proteinHit7,
      dca: dcaStreak,
      weigh_in: weighStreak,
    },
    today_ymd: todayYmd,
  });
}
