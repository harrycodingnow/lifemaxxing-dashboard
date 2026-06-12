import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiabilityRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  name: string;
  balance: number;
  currency: string;
  kind: string;
  sort_order: number;
  archived_at: number | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const rows = db
    .prepare(
      `SELECT id, created_ts, updated_ts, name, balance, currency, kind, sort_order, archived_at
       FROM liabilities
       WHERE ${includeArchived ? "1=1" : "archived_at IS NULL"}
       ORDER BY sort_order ASC, created_ts ASC`
    )
    .all() as LiabilityRow[];
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<LiabilityRow> & { name: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const balance = Number(body.balance);
  if (!Number.isFinite(balance)) {
    return NextResponse.json({ error: "balance must be a number" }, { status: 400 });
  }
  // Store debt as a positive number regardless of sign the user enters.
  const owed = Math.abs(balance);
  const currency = body.currency === "USD" ? "USD" : "TWD";
  const kind = ["loan", "credit_card", "mortgage", "other"].includes(body.kind as string)
    ? body.kind
    : "loan";
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO liabilities (created_ts, updated_ts, name, balance, currency, kind, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      now,
      now,
      name,
      owed,
      currency,
      kind,
      Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : now
    );
  const row = db.prepare("SELECT * FROM liabilities WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json({ row });
}
