import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCryptoQuotesBatch } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradeRow = {
  id: number;
  ts: number;
  asset_type: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  note: string | null;
};

export async function GET() {
  // All trades tagged as the DCA recurring job
  const rows = db
    .prepare(
      `SELECT id, ts, asset_type, symbol, side, quantity, price, currency, note
       FROM trades
       WHERE note LIKE '%daily DCA%'
       ORDER BY ts ASC`,
    )
    .all() as TradeRow[];

  const buys = rows.filter((r) => r.side === "buy" && r.asset_type === "crypto");
  const sells = rows.filter((r) => r.side === "sell");

  // Aggregate BTC accumulated (assuming single target asset BTC for now)
  let totalBtc = 0;
  let totalUsdSpent = 0;
  for (const b of buys) {
    totalBtc += b.quantity;
    totalUsdSpent += b.quantity * b.price; // USD
  }
  const avgCost = totalBtc > 0 ? totalUsdSpent / totalBtc : null;

  // Current BTC price for live P&L
  let currentPrice: number | null = null;
  let marketValue: number | null = null;
  let pnl: number | null = null;
  let pnlPct: number | null = null;
  try {
    const q = await getCryptoQuotesBatch(["BTC"]);
    currentPrice = q["BTC"]?.price ?? null;
    if (currentPrice != null && totalBtc > 0) {
      marketValue = totalBtc * currentPrice;
      pnl = marketValue - totalUsdSpent;
      pnlPct = totalUsdSpent > 0 ? (pnl / totalUsdSpent) * 100 : null;
    }
  } catch {
    // ignore
  }

  const lastBuy = buys.at(-1) ?? null;
  const lastSell = sells.at(-1) ?? null;
  // DCA script writes ts in seconds; UI expects ms. Normalize.
  const toMs = (t: number | null | undefined) =>
    t == null ? null : t < 1e12 ? t * 1000 : t;
  const lastRunTs = toMs(lastBuy?.ts);
  const nextRunTs = lastRunTs ? lastRunTs + 24 * 60 * 60 * 1000 : null;

  return NextResponse.json({
    job: {
      name: "lifemaxx-dca-usdc-btc",
      schedule: "every 24h",
      action: "Convert 8 USDC → BTC daily",
      source: "USDC",
      target: "BTC",
      amountPerRun: lastSell?.quantity ?? 8,
    },
    runs: buys.length,
    last_run_ts: lastRunTs,
    next_run_ts: nextRunTs,
    totalBtc,
    totalUsdSpent,
    avgCost,
    currentPrice,
    marketValue,
    pnl,
    pnlPct,
    history: buys.slice(-7).map((b) => ({
      ts: b.ts,
      btc: b.quantity,
      price: b.price,
      usd: b.quantity * b.price,
    })),
  });
}
