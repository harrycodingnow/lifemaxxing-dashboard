// Lightweight price fetcher: Yahoo Finance chart endpoint (no auth required) for stocks
// (TWSE via .TW suffix, US plain), CoinGecko simple-price for crypto.

const cryptoIdMap: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  ADA: "cardano",
  XRP: "ripple",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
  TRX: "tron",
  ARB: "arbitrum",
  OP: "optimism",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

export type PriceQuote = {
  price: number;
  currency: string;
  changePct: number | null;
  asOf: number;
};

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { "User-Agent": "Mozilla/5.0 lifemaxx", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

export async function getStockQuote(symbol: string): Promise<PriceQuote> {
  // Yahoo Finance chart endpoint (publicly accessible, no auth required)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const j = await fetchJson(url);
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`no chart data for ${symbol}`);
  const meta = result.meta || {};
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  if (typeof price !== "number") throw new Error(`no price for ${symbol}`);
  const changePct =
    typeof prevClose === "number" && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;
  return {
    price,
    currency: meta.currency || (symbol.endsWith(".TW") ? "TWD" : "USD"),
    changePct,
    asOf: (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
  };
}

export async function getCryptoQuote(ticker: string): Promise<PriceQuote> {
  const id = cryptoIdMap[ticker.toUpperCase()] || ticker.toLowerCase();
  const all = await getCryptoQuotesBatch([ticker]);
  const q = all.get(ticker.toUpperCase());
  if (!q) throw new Error(`no crypto price for ${ticker} (id=${id})`);
  return q;
}

// Module-level in-memory cache to avoid hammering CoinGecko (free tier ~30 req/min).
type CryptoCacheEntry = { quotes: Map<string, PriceQuote>; at: number };
let cryptoCache: CryptoCacheEntry | null = null;
const CRYPTO_TTL_MS = 60_000;
let inflight: Promise<Map<string, PriceQuote>> | null = null;

export async function getCryptoQuotesBatch(tickers: string[]): Promise<Map<string, PriceQuote>> {
  const now = Date.now();
  if (cryptoCache && now - cryptoCache.at < CRYPTO_TTL_MS) {
    return cryptoCache.quotes;
  }
  if (inflight) return inflight;
  const tickersUpper = tickers.map((t) => t.toUpperCase());
  const ids = Array.from(
    new Set(tickersUpper.map((t) => cryptoIdMap[t] || t.toLowerCase())),
  );
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(","),
  )}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  inflight = (async () => {
    try {
      const j = await fetchJson(url);
      const out = new Map<string, PriceQuote>();
      for (const t of tickersUpper) {
        const id = cryptoIdMap[t] || t.toLowerCase();
        const row = j?.[id];
        if (!row || typeof row.usd !== "number") continue;
        out.set(t, {
          price: row.usd,
          currency: "USD",
          changePct: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
          asOf: (row.last_updated_at || Math.floor(Date.now() / 1000)) * 1000,
        });
      }
      cryptoCache = { quotes: out, at: Date.now() };
      return out;
    } catch (e) {
      // On failure, keep serving the last good cache if we have one.
      if (cryptoCache) return cryptoCache.quotes;
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function getQuote(assetType: string, symbol: string): Promise<PriceQuote> {
  if (assetType === "crypto") return getCryptoQuote(symbol);
  return getStockQuote(symbol);
}

export async function getUsdTwd(): Promise<number> {
  try {
    const q = await getStockQuote("TWD=X");
    return q.price || 32;
  } catch {
    return 32;
  }
}
