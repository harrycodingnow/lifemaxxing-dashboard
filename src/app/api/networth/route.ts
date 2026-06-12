import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getQuote, getUsdTwd, getCryptoQuotesBatch } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CashRow = { name: string; balance: number; currency: string; kind: string };
type LiabRow = { name: string; balance: number; currency: string; kind: string };
type TradeRow = { asset_type: string; symbol: string; side: string; quantity: number; price: number; currency: string };

// GET /api/networth — full net worth = portfolio market value + cash − liabilities,
// returned in both USD and TWD. Portfolio degrades gracefully if live prices fail.
export async function GET(_req: NextRequest) {
  const cash = db
    .prepare("SELECT name, balance, currency, kind FROM cash_accounts WHERE archived_at IS NULL")
    .all() as CashRow[];
  const liabs = db
    .prepare("SELECT name, balance, currency, kind FROM liabilities WHERE archived_at IS NULL")
    .all() as LiabRow[];

  // FX: prefer a live quote, fall back to cached settings, then a crude default.
  let usdTwd = 32;
  try {
    usdTwd = await getUsdTwd();
  } catch {
    const row = db.prepare("SELECT value FROM settings WHERE key='usd_twd_cache'").get() as { value?: string } | undefined;
    const n = Number(row?.value);
    if (Number.isFinite(n) && n > 20 && n < 50) usdTwd = n;
  }
  // Persist the FX we used so other routes (stats) can reuse it offline.
  if (usdTwd > 20 && usdTwd < 50) {
    db.prepare("INSERT INTO settings(key, value) VALUES('usd_twd_cache', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(usdTwd));
  }
  const toUsd = (n: number, ccy: string) => (ccy === "TWD" ? n / usdTwd : n);

  let cashUsd = 0;
  for (const c of cash) cashUsd += toUsd(c.balance, c.currency);
  let liabUsd = 0;
  for (const l of liabs) liabUsd += toUsd(Math.abs(l.balance), l.currency);

  // Portfolio market value (avg-cost positions priced live; cost-basis fallback per position).
  let portfolioUsd = 0;
  let portfolioOk = true;
  try {
    const trades = db
      .prepare("SELECT asset_type, symbol, side, quantity, price, currency FROM trades WHERE deleted_at IS NULL")
      .all() as TradeRow[];
    type Pos = { asset_type: string; symbol: string; currency: string; quantity: number; cost_native: number };
    const map = new Map<string, Pos>();
    for (const t of trades) {
      const key = `${t.asset_type}|${t.symbol}`;
      let p = map.get(key);
      if (!p) { p = { asset_type: t.asset_type, symbol: t.symbol, currency: t.currency, quantity: 0, cost_native: 0 }; map.set(key, p); }
      if (t.side === "buy") {
        p.quantity += t.quantity;
        p.cost_native += t.quantity * t.price;
      } else {
        const avg = p.quantity > 0 ? p.cost_native / p.quantity : 0;
        const q = Math.min(t.quantity, p.quantity);
        p.quantity -= q;
        p.cost_native -= avg * q;
      }
    }
    const positions = [...map.values()].filter((p) => p.quantity > 1e-9);
    const cryptoTickers = positions.filter((p) => p.asset_type === "crypto").map((p) => p.symbol);
    if (cryptoTickers.length) {
      try { await getCryptoQuotesBatch(cryptoTickers); } catch { /* fall through to per-position */ }
    }
    for (const p of positions) {
      let mvNative = p.cost_native; // fallback to cost basis if quote fails
      let quoteCcy = p.currency;
      try {
        const q = await getQuote(p.asset_type, p.symbol);
        mvNative = q.price * p.quantity;
        quoteCcy = q.currency;
      } catch {
        portfolioOk = false;
      }
      portfolioUsd += toUsd(mvNative, quoteCcy);
    }
  } catch {
    portfolioOk = false;
  }

  const netUsd = portfolioUsd + cashUsd - liabUsd;
  const toTwd = (n: number) => n * usdTwd;

  return NextResponse.json({
    fx: { usd_twd: usdTwd },
    portfolio_ok: portfolioOk,
    components: {
      portfolio: { usd: portfolioUsd, twd: toTwd(portfolioUsd) },
      cash: { usd: cashUsd, twd: toTwd(cashUsd) },
      liabilities: { usd: liabUsd, twd: toTwd(liabUsd) },
    },
    net_worth: { usd: netUsd, twd: toTwd(netUsd) },
    counts: { cash: cash.length, liabilities: liabs.length },
  });
}
