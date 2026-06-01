import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getQuote, getUsdTwd, getCryptoQuotesBatch } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradeRow = {
  id: number;
  ts: number;
  asset_type: string;
  symbol: string;
  display_name: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  note: string;
};

export async function GET() {
  const trades = db.prepare("SELECT * FROM trades ORDER BY ts ASC").all() as TradeRow[];

  // Aggregate per symbol
  type Pos = {
    asset_type: string;
    symbol: string;
    display_name: string;
    currency: string;
    quantity: number;
    cost_basis_native: number; // cumulative cost in native currency (after sells reducing proportionally)
  };
  const map = new Map<string, Pos>();
  for (const t of trades) {
    const key = `${t.asset_type}|${t.symbol}`;
    let p = map.get(key);
    if (!p) {
      p = {
        asset_type: t.asset_type,
        symbol: t.symbol,
        display_name: t.display_name,
        currency: t.currency,
        quantity: 0,
        cost_basis_native: 0,
      };
      map.set(key, p);
    }
    if (t.side === "buy") {
      p.quantity += t.quantity;
      p.cost_basis_native += t.quantity * t.price;
    } else {
      // sell: reduce proportional cost basis (avg-cost method)
      const avg = p.quantity > 0 ? p.cost_basis_native / p.quantity : 0;
      const sellQty = Math.min(t.quantity, p.quantity);
      p.quantity -= sellQty;
      p.cost_basis_native -= avg * sellQty;
    }
  }

  const positions = [...map.values()].filter((p) => p.quantity > 1e-9);

  const usdTwd = await getUsdTwd();

  // Prefetch all crypto quotes in ONE CoinGecko call (avoids rate-limit hits per-symbol).
  const cryptoTickers = positions.filter((p) => p.asset_type === "crypto").map((p) => p.symbol);
  if (cryptoTickers.length > 0) {
    try {
      await getCryptoQuotesBatch(cryptoTickers);
    } catch (e) {
      console.error("[portfolio] crypto batch fetch failed:", (e as Error).message);
    }
  }

  const quoted = await Promise.all(
    positions.map(async (p) => {
      let price: number | null = null;
      let changePct: number | null = null;
      let quoteCurrency = p.currency;
      try {
        const q = await getQuote(p.asset_type, p.symbol);
        price = q.price;
        changePct = q.changePct;
        quoteCurrency = q.currency;
      } catch (e) {
        console.error(`[portfolio] quote failed ${p.asset_type}/${p.symbol}:`, (e as Error).message);
      }
      const marketNative = price != null ? price * p.quantity : null;
      const avgCost = p.cost_basis_native / p.quantity;
      const pnlNative = marketNative != null ? marketNative - p.cost_basis_native : null;
      const pnlPct =
        marketNative != null && p.cost_basis_native > 0
          ? (pnlNative! / p.cost_basis_native) * 100
          : null;

      // Convert to USD for unified totals
      const toUsd = (n: number, ccy: string) => (ccy === "TWD" ? n / usdTwd : n);
      return {
        ...p,
        avg_cost: avgCost,
        current_price: price,
        change_pct_today: changePct,
        market_value_native: marketNative,
        pnl_native: pnlNative,
        pnl_pct: pnlPct,
        market_value_usd: marketNative != null ? toUsd(marketNative, quoteCurrency) : null,
        cost_usd: toUsd(p.cost_basis_native, p.currency),
      };
    }),
  );

  // For totals, if a position is missing a live price, fall back to cost so the
  // overall number isn't misleadingly underwater.
  const totalMarketUsd = quoted.reduce(
    (s, q) => s + (q.market_value_usd != null ? q.market_value_usd : q.cost_usd),
    0,
  );
  const totalCostUsd = quoted.reduce((s, q) => s + q.cost_usd, 0);
  const totalPnlUsd = totalMarketUsd - totalCostUsd;

  return NextResponse.json({
    positions: quoted,
    totals: {
      market_value_usd: totalMarketUsd,
      cost_usd: totalCostUsd,
      pnl_usd: totalPnlUsd,
      pnl_pct: totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0,
    },
    fx: { usd_twd: usdTwd },
    trade_count: trades.length,
  });
}
