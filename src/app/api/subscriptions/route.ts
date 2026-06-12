import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  name: string;
  amount: number;
  currency: string;
  cycle: string;
  next_charge_ts: number | null;
  url: string | null;
  notes: string | null;
  sort_order: number;
  archived_at: number | null;
};

// Normalize a per-cycle amount to an equivalent monthly amount.
export function monthlyAmount(amount: number, cycle: string): number {
  switch (cycle) {
    case "yearly":
      return amount / 12;
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
    default:
      return amount;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const rows = db
    .prepare(
      `SELECT id, created_ts, updated_ts, name, amount, currency, cycle,
              next_charge_ts, url, notes, sort_order, archived_at
       FROM subscriptions
       WHERE ${includeArchived ? "1=1" : "archived_at IS NULL"}
       ORDER BY
         CASE WHEN next_charge_ts IS NULL THEN 1 ELSE 0 END ASC,
         next_charge_ts ASC,
         sort_order ASC,
         created_ts DESC`
    )
    .all() as SubscriptionRow[];

  // Monthly burn split by currency (so the UI can show NT$ / $ separately or FX-combine).
  let monthlyTwd = 0;
  let monthlyUsd = 0;
  for (const r of rows) {
    if (r.archived_at) continue;
    const m = monthlyAmount(r.amount, r.cycle);
    if (r.currency === "USD") monthlyUsd += m;
    else monthlyTwd += m;
  }

  return NextResponse.json({
    rows,
    monthly: { twd: monthlyTwd, usd: monthlyUsd },
    yearly: { twd: monthlyTwd * 12, usd: monthlyUsd * 12 },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<SubscriptionRow> & { name: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }
  const cycle = ["weekly", "monthly", "yearly"].includes(body.cycle as string) ? body.cycle : "monthly";
  const currency = body.currency === "USD" ? "USD" : "TWD";
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO subscriptions
         (created_ts, updated_ts, name, amount, currency, cycle, next_charge_ts, url, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      now,
      now,
      name,
      amount,
      currency,
      cycle,
      body.next_charge_ts ?? null,
      body.url ?? null,
      body.notes ?? null,
      Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : now
    );
  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json({ row });
}
