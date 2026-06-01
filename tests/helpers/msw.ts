// Default MSW handlers for Yahoo Finance + CoinGecko. Tests can override per-test
// using server.use(...) — see tests/setup.ts.

import { http, HttpResponse } from "msw";

const yahooChart = (price: number, prevClose: number, currency = "USD") => ({
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: price,
          chartPreviousClose: prevClose,
          previousClose: prevClose,
          currency,
          regularMarketTime: 1_717_000_000,
        },
      },
    ],
  },
});

// Per-symbol fixed quotes. Override per test by calling server.use(...) with a
// new http.get matcher.
const STOCK_QUOTES: Record<string, { price: number; prev: number; currency?: string }> = {
  AAPL:        { price: 200, prev: 195, currency: "USD" },
  NVDA:        { price: 450, prev: 440, currency: "USD" },
  GOOGL:       { price: 180, prev: 175, currency: "USD" },
  NOW:         { price: 1000, prev: 990, currency: "USD" },
  ARTY:        { price: 50, prev: 49, currency: "USD" },
  "2330.TW":   { price: 1000, prev: 980, currency: "TWD" },
  "0050.TW":   { price: 150, prev: 148, currency: "TWD" },
  "00981A.TW": { price: 20, prev: 19.5, currency: "TWD" },
  "00403A.TW": { price: 18, prev: 17.8, currency: "TWD" },
  "TWD=X":     { price: 32, prev: 32, currency: "TWD" }, // USD/TWD fx
};

const CRYPTO_PRICES: Record<string, { usd: number; change24h: number }> = {
  bitcoin:     { usd: 70000, change24h: 1.5 },
  ethereum:    { usd: 3500, change24h: -0.5 },
  solana:      { usd: 150, change24h: 2.1 },
  ripple:      { usd: 0.5, change24h: 0.2 },
  chainlink:   { usd: 15, change24h: -1.0 },
  "usd-coin":  { usd: 1, change24h: 0 },
  tether:      { usd: 1, change24h: 0 },
  cardano:     { usd: 0.4, change24h: 0.5 },
  dogecoin:    { usd: 0.15, change24h: 1.2 },
};

export function defaultHandlers() {
  return [
    http.get(
      "https://query1.finance.yahoo.com/v8/finance/chart/:symbol",
      ({ params }) => {
        const symbol = decodeURIComponent(String(params.symbol));
        const q = STOCK_QUOTES[symbol];
        if (!q) {
          // Unknown symbol → 404, lets the production code's catch path run.
          return HttpResponse.json({ error: "not found" }, { status: 404 });
        }
        return HttpResponse.json(yahooChart(q.price, q.prev, q.currency));
      },
    ),
    http.get("https://api.coingecko.com/api/v3/simple/price", ({ request }) => {
      const url = new URL(request.url);
      const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean);
      const out: Record<string, { usd: number; usd_24h_change: number; last_updated_at: number }> = {};
      for (const id of ids) {
        const p = CRYPTO_PRICES[id];
        if (p) {
          out[id] = { usd: p.usd, usd_24h_change: p.change24h, last_updated_at: 1_717_000_000 };
        }
      }
      return HttpResponse.json(out);
    }),
  ];
}

export { STOCK_QUOTES, CRYPTO_PRICES, yahooChart };
