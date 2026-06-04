import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TodoRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  title: string;
  notes: string | null;
  due_ts: number | null;
  priority: number;
  done: number;
  done_ts: number | null;
  sort_order: number;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeDone = url.searchParams.get("done") !== "0";
  const rows = db
    .prepare(
      `SELECT id, created_ts, updated_ts, title, notes, due_ts, priority, done, done_ts, sort_order
       FROM todos
       WHERE deleted_at IS NULL ${includeDone ? "" : "AND done = 0"}
       ORDER BY done ASC,
                CASE WHEN due_ts IS NULL THEN 1 ELSE 0 END ASC,
                due_ts ASC,
                priority DESC,
                sort_order ASC,
                created_ts ASC`
    )
    .all() as TodoRow[];
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<TodoRow> & { title: string };
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO todos (created_ts, updated_ts, title, notes, due_ts, priority, done, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      now,
      now,
      title,
      body.notes ?? null,
      body.due_ts ?? null,
      Number.isFinite(body.priority as number) ? (body.priority as number) : 0,
      Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : now
    );
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json({ row });
}
