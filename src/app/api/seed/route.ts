import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getQuote } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot seed for initial US-stock holdings.
// Cost basis defaults to current market price (so opening P&L = 0).
// POST with { force: true } to seed even if these symbols already exist.

const SEEDS: Array<{ symbol: string; display_name: string; quantity: number; asset_type: "us_stock" | "tw_stock" | "crypto"; currency: "USD" | "TWD" }> = [
  { symbol: "GOOGL",    display_name: "Alphabet (Class A)",              quantity: 2.77,    asset_type: "us_stock", currency: "USD" },
  { symbol: "NVDA",     display_name: "NVIDIA",                          quantity: 4.04,    asset_type: "us_stock", currency: "USD" },
  { symbol: "NOW",      display_name: "ServiceNow",                      quantity: 0.29133, asset_type: "us_stock", currency: "USD" },
  { symbol: "ARTY",     display_name: "iShares Future AI & Tech ETF",    quantity: 1.79,    asset_type: "us_stock", currency: "USD" },
  { symbol: "0050.TW",  display_name: "元大台灣50",                       quantity: 597,     asset_type: "tw_stock", currency: "TWD" },
  { symbol: "00981A.TW",display_name: "統一台股增長主動式ETF",             quantity: 1503,    asset_type: "tw_stock", currency: "TWD" },
  { symbol: "00403A.TW",display_name: "野村臺灣創新50主動式ETF",           quantity: 1000,    asset_type: "tw_stock", currency: "TWD" },
  { symbol: "BTC",      display_name: "Bitcoin",                         quantity: 0.02782194,   asset_type: "crypto",   currency: "USD" },
  { symbol: "ETH",      display_name: "Ethereum",                        quantity: 0.06708928,   asset_type: "crypto",   currency: "USD" },
  { symbol: "XRP",      display_name: "XRP",                             quantity: 374.03169465, asset_type: "crypto",   currency: "USD" },
  { symbol: "LINK",     display_name: "Chainlink",                       quantity: 22.98848527,  asset_type: "crypto",   currency: "USD" },
  { symbol: "USDC",     display_name: "USD Coin",                        quantity: 587.000078,   asset_type: "crypto",   currency: "USD" },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const overridePrices: Record<string, number> = body?.prices || {};

  const results: Array<{ symbol: string; status: string; price?: number; id?: number | bigint }> = [];

  for (const s of SEEDS) {
    const existing = db
      .prepare("SELECT id FROM trades WHERE symbol = ? AND note = ?")
      .get(s.symbol, "seed:initial") as { id: number } | undefined;

    if (existing && !force) {
      results.push({ symbol: s.symbol, status: "skipped (already seeded)" });
      continue;
    }

    let price = overridePrices[s.symbol];
    if (!price) {
      try {
        const q = await getQuote(s.asset_type, s.symbol);
        price = q?.price ?? 0;
      } catch {
        price = 0;
      }
    }

    if (!price) {
      results.push({ symbol: s.symbol, status: "failed: no price available" });
      continue;
    }

    const info = db
      .prepare(
        `INSERT INTO trades (ts, asset_type, symbol, display_name, side, quantity, price, currency, note)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        Date.now(),
        s.asset_type,
        s.symbol,
        s.display_name,
        "buy",
        s.quantity,
        price,
        s.currency,
        "seed:initial",
      );

    results.push({ symbol: s.symbol, status: "inserted", price, id: info.lastInsertRowid });
  }

  return NextResponse.json({ results });
}
