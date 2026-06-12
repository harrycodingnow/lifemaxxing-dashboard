import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { localDay } from "@/lib/habits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/habits/log — upsert one (habit_id, day) log row.
// Body: { habit_id, status?: 'done'|'skip'|'none', day?: 'YYYY-MM-DD', tz?: number }
// 'none' soft-clears the day (we never DELETE rows per SOUL.md).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const habitId = parseInt(String(body?.habit_id), 10);
  if (!Number.isFinite(habitId)) {
    return NextResponse.json({ error: "habit_id required" }, { status: 400 });
  }
  const exists = db.prepare("SELECT id FROM habits WHERE id = ?").get(habitId);
  if (!exists) return NextResponse.json({ error: "habit not found" }, { status: 404 });

  const status = ["done", "skip", "none"].includes(body?.status) ? body.status : "done";
  const tzMin = Number.isFinite(Number(body?.tz)) ? Number(body.tz) : 0;
  const day: string =
    typeof body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      ? body.day
      : localDay(Date.now(), tzMin);
  const ts = Date.now();

  db.prepare(
    `INSERT INTO habit_logs (habit_id, day, status, ts)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(habit_id, day) DO UPDATE SET status = excluded.status, ts = excluded.ts`
  ).run(habitId, day, status, ts);

  const row = db
    .prepare("SELECT habit_id, day, status, ts FROM habit_logs WHERE habit_id = ? AND day = ?")
    .get(habitId, day);
  return NextResponse.json({ ok: true, log: row });
}

// GET /api/habits/log?habit_id=N&days=30 — return recent log days for one habit (for the heatmap).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const habitId = parseInt(url.searchParams.get("habit_id") || "", 10);
  if (!Number.isFinite(habitId)) {
    return NextResponse.json({ error: "habit_id required" }, { status: 400 });
  }
  const limit = Math.max(1, Math.min(366, parseInt(url.searchParams.get("days") || "60", 10)));
  const rows = db
    .prepare(
      "SELECT day, status, ts FROM habit_logs WHERE habit_id = ? ORDER BY day DESC LIMIT ?"
    )
    .all(habitId, limit) as Array<{ day: string; status: string; ts: number }>;
  return NextResponse.json({ habit_id: habitId, logs: rows });
}
