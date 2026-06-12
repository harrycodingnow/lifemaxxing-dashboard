import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hermesCall } from "@/lib/hermes";
import { WEEKLY_REVIEW_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradeRow = { ts: number; side: string; asset_type: string; symbol: string; display_name: string | null; quantity: number; price: number; currency: string };
type MealRow = { ts: number; calories: number; protein_g: number; carbs_g: number; fat_g: number };
type WeightRow = { ts: number; weight_kg: number };
type TodoRow = { title: string; done: number; done_ts: number | null; created_ts: number };
type HabitLogRow = { habit_id: number; day: string; status: string };

export type WeeklyDigest = ReturnType<typeof buildWeeklyDigest>;

// Pure, DB-only digest of the trailing `windowDays` window. No LLM, fully testable.
export function buildWeeklyDigest(windowDays = 7, now = Date.now()) {
  const since = now - windowDays * 86400_000;

  const trades = db
    .prepare("SELECT ts, side, asset_type, symbol, display_name, quantity, price, currency FROM trades WHERE deleted_at IS NULL AND ts >= ? ORDER BY ts ASC")
    .all(since) as TradeRow[];

  const meals = db
    .prepare("SELECT ts, calories, protein_g, carbs_g, fat_g FROM meals WHERE deleted_at IS NULL AND ts >= ?")
    .all(since) as MealRow[];

  const weights = db
    .prepare("SELECT ts, weight_kg FROM weights WHERE deleted_at IS NULL AND ts >= ? ORDER BY ts ASC")
    .all(since) as WeightRow[];

  const todosDone = db
    .prepare("SELECT title, done, done_ts, created_ts FROM todos WHERE deleted_at IS NULL AND done = 1 AND done_ts >= ? ORDER BY done_ts ASC")
    .all(since) as TodoRow[];
  const todosAdded = db
    .prepare("SELECT title, done, done_ts, created_ts FROM todos WHERE deleted_at IS NULL AND created_ts >= ?")
    .all(since) as TodoRow[];
  const todosOpen = db
    .prepare("SELECT COUNT(*) AS c FROM todos WHERE deleted_at IS NULL AND done = 0").get() as { c: number };

  const habitLogs = db
    .prepare("SELECT habit_id, day, status FROM habit_logs WHERE ts >= ?")
    .all(since) as HabitLogRow[];
  const habitNames = db
    .prepare("SELECT id, name FROM habits WHERE archived_at IS NULL").all() as Array<{ id: number; name: string }>;
  const habitNameById = new Map(habitNames.map((h) => [h.id, h.name]));
  const habitDoneByName = new Map<string, number>();
  for (const l of habitLogs) {
    if (l.status !== "done") continue;
    const name = habitNameById.get(l.habit_id) || `#${l.habit_id}`;
    habitDoneByName.set(name, (habitDoneByName.get(name) || 0) + 1);
  }

  const mealTotals = meals.reduce(
    (a, m) => {
      a.calories += m.calories || 0;
      a.protein_g += m.protein_g || 0;
      a.carbs_g += m.carbs_g || 0;
      a.fat_g += m.fat_g || 0;
      return a;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const mealDays = new Set(meals.map((m) => new Date(m.ts).toISOString().slice(0, 10))).size;

  const firstW = weights[0]?.weight_kg ?? null;
  const lastW = weights.at(-1)?.weight_kg ?? null;

  return {
    window_days: windowDays,
    since,
    trades: {
      count: trades.length,
      buys: trades.filter((t) => t.side === "buy").length,
      sells: trades.filter((t) => t.side === "sell").length,
      items: trades.map((t) => ({
        side: t.side,
        qty: t.quantity,
        name: t.display_name || t.symbol,
        price: t.price,
        currency: t.currency,
      })),
    },
    nutrition: {
      meals_logged: meals.length,
      days_logged: mealDays,
      avg_calories_per_logged_day: mealDays ? Math.round(mealTotals.calories / mealDays) : 0,
      avg_protein_per_logged_day: mealDays ? Math.round(mealTotals.protein_g / mealDays) : 0,
    },
    weight: {
      readings: weights.length,
      first_kg: firstW,
      last_kg: lastW,
      delta_kg: firstW != null && lastW != null ? +(lastW - firstW).toFixed(1) : null,
    },
    todos: {
      completed: todosDone.length,
      added: todosAdded.length,
      still_open: todosOpen.c,
      completed_titles: todosDone.map((t) => t.title).slice(0, 20),
    },
    habits: {
      tracked: habitNames.length,
      done_counts: Object.fromEntries(habitDoneByName),
    },
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const windowDays = Math.max(1, Math.min(31, parseInt(url.searchParams.get("window") || "7", 10)));
  const wantSummary = url.searchParams.get("summary") !== "0";

  const digest = buildWeeklyDigest(windowDays);

  let summary: string | null = null;
  let summaryError: string | null = null;
  if (wantSummary) {
    try {
      const raw = await hermesCall(WEEKLY_REVIEW_PROMPT(JSON.stringify(digest, null, 2)), {
        timeoutMs: 120_000,
      });
      summary = raw.trim();
    } catch (e) {
      summaryError = (e as Error).message;
    }
  }

  return NextResponse.json({ digest, summary, summary_error: summaryError });
}
