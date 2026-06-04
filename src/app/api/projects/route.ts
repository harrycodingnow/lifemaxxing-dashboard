import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  name: string;
  description: string | null;
  phase: string;
  status: string;
  current_problem: string | null;
  next_step: string | null;
  priority: number;
  url: string | null;
  sort_order: number;
  archived_at: number | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const rows = db
    .prepare(
      `SELECT id, created_ts, updated_ts, name, description, phase, status,
              current_problem, next_step, priority, url, sort_order, archived_at
       FROM projects
       WHERE ${includeArchived ? "1=1" : "archived_at IS NULL"}
       ORDER BY
         CASE phase
           WHEN 'building' THEN 0
           WHEN 'shipping' THEN 1
           WHEN 'planning' THEN 2
           WHEN 'maintaining' THEN 3
           WHEN 'idea' THEN 4
           WHEN 'paused' THEN 5
           WHEN 'done' THEN 6
           ELSE 7
         END ASC,
         priority DESC,
         sort_order ASC,
         created_ts DESC`
    )
    .all() as ProjectRow[];
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<ProjectRow> & { name: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO projects
         (created_ts, updated_ts, name, description, phase, status,
          current_problem, next_step, priority, url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      now,
      now,
      name,
      body.description ?? null,
      body.phase ?? "idea",
      body.status ?? "on_track",
      body.current_problem ?? null,
      body.next_step ?? null,
      Number.isFinite(body.priority as number) ? (body.priority as number) : 2,
      body.url ?? null,
      Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : now
    );
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json({ row });
}
