import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  calories: Number(process.env.GOAL_CALORIES || 2200),
  protein_g: Number(process.env.GOAL_PROTEIN || 160),
  carbs_g: Number(process.env.GOAL_CARBS || 240),
  fat_g: Number(process.env.GOAL_FAT || 70),
};

const KEYS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
type Key = (typeof KEYS)[number];

export function readGoals() {
  const out = { ...DEFAULTS };
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'goal.%'").all() as Array<{
    key: string;
    value: string;
  }>;
  for (const r of rows) {
    const k = r.key.slice(5) as Key;
    if ((KEYS as readonly string[]).includes(k)) {
      const n = Number(r.value);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

export async function GET() {
  return NextResponse.json({ goals: readGoals(), defaults: DEFAULTS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const patch = (body?.goals ?? body) as Partial<Record<Key, unknown>>;
  const stmt = db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const k of KEYS) {
    const v = patch[k];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    stmt.run(`goal.${k}`, String(Math.round(n)));
  }
  return NextResponse.json({ goals: readGoals() });
}
