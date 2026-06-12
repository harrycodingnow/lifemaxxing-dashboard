import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStreak, longestStreak, doneInLastN, localDay } from "@/lib/habits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  name: string;
  emoji: string | null;
  sort_order: number;
  archived_at: number | null;
};
type LogRow = { habit_id: number; day: string; status: string };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const tzMin = parseInt(url.searchParams.get("tz") || "0", 10);
  const todayYmd = localDay(Date.now(), tzMin);

  const habits = db
    .prepare(
      `SELECT id, created_ts, updated_ts, name, emoji, sort_order, archived_at
       FROM habits
       WHERE ${includeArchived ? "1=1" : "archived_at IS NULL"}
       ORDER BY sort_order ASC, created_ts ASC`
    )
    .all() as HabitRow[];

  const logs = db
    .prepare("SELECT habit_id, day, status FROM habit_logs")
    .all() as LogRow[];

  const byHabit = new Map<number, { done: Set<string>; skip: Set<string> }>();
  for (const l of logs) {
    let s = byHabit.get(l.habit_id);
    if (!s) { s = { done: new Set(), skip: new Set() }; byHabit.set(l.habit_id, s); }
    // Only 'done' and 'skip' count; 'none' (soft-cleared) and any other value are ignored.
    if (l.status === "done") s.done.add(l.day);
    else if (l.status === "skip") s.skip.add(l.day);
  }

  const rows = habits.map((h) => {
    const s = byHabit.get(h.id) || { done: new Set<string>(), skip: new Set<string>() };
    const todayStatus = s.done.has(todayYmd) ? "done" : s.skip.has(todayYmd) ? "skip" : null;
    return {
      ...h,
      streak: currentStreak(s.done, s.skip, todayYmd),
      longest: longestStreak(s.done),
      done_last_7: doneInLastN(s.done, todayYmd, 7),
      done_last_30: doneInLastN(s.done, todayYmd, 30),
      today_status: todayStatus,
      total_done: s.done.size,
    };
  });

  return NextResponse.json({ rows, today_ymd: todayYmd });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<HabitRow> & { name: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO habits (created_ts, updated_ts, name, emoji, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      now,
      now,
      name,
      body.emoji ?? null,
      Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : now
    );
  const row = db.prepare("SELECT * FROM habits WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json({ row });
}
