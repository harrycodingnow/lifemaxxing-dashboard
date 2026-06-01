import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { readGoals } from "../goals/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MealRow = {
  id: number;
  ts: number;
  description: string;
  meal_type: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items_json: string;
  sources_json: string | null;
};

function startOfDayLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export async function GET(req: NextRequest) {
  const dayParam = req.nextUrl.searchParams.get("day"); // YYYY-MM-DD optional
  const dayStart = dayParam ? new Date(dayParam + "T00:00:00").getTime() : startOfDayLocal();
  const dayEnd = dayStart + 24 * 3600 * 1000;

  const meals = db
    .prepare("SELECT * FROM meals WHERE ts >= ? AND ts < ? ORDER BY ts ASC")
    .all(dayStart, dayEnd) as MealRow[];

  const totals = meals.reduce(
    (acc, m) => {
      acc.calories += m.calories;
      acc.protein_g += m.protein_g;
      acc.carbs_g += m.carbs_g;
      acc.fat_g += m.fat_g;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  // User-configurable goals (settings table, overridable via env defaults)
  const goals = readGoals();

  return NextResponse.json({
    day: new Date(dayStart).toISOString().slice(0, 10),
    meals: meals.map((m) => ({
      ...m,
      items: JSON.parse(m.items_json || "[]"),
      sources: JSON.parse(m.sources_json || "[]"),
    })),
    totals,
    goals,
  });
}
