// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { server } from "../setup";
import { http, HttpResponse } from "msw";

// We must import after the global mocks are set up.
import { getStockQuote, getCryptoQuotesBatch, getCryptoQuote, getUsdTwd } from "@/lib/prices";

beforeEach(() => {
  vi.resetModules();
});

describe("getStockQuote", () => {
  it("parses Yahoo chart shape and computes changePct", async () => {
    const q = await getStockQuote("AAPL"); // price 200, prev 195
    expect(q.price).toBe(200);
    expect(q.currency).toBe("USD");
    expect(q.changePct).toBeCloseTo(((200 - 195) / 195) * 100, 5);
  });

  it("defaults currency to TWD when symbol ends in .TW and meta omits currency", async () => {
    server.use(
      http.get(
        "https://query1.finance.yahoo.com/v8/finance/chart/:symbol",
        () =>
          HttpResponse.json({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 99,
                    chartPreviousClose: 90,
                    regularMarketTime: 1_717_000_000,
                  },
                },
              ],
            },
          }),
      ),
    );
    const q = await getStockQuote("2330.TW");
    expect(q.currency).toBe("TWD");
    expect(q.price).toBe(99);
  });
});

// CoinGecko batch caching/dedupe — the module holds in-memory state, so each
// test resets it via dynamic import in vi.resetModules + a fresh import.
async function freshPrices() {
  vi.resetModules();
  return import("@/lib/prices");
}

describe("getCryptoQuotesBatch", () => {
  it("deduplicates tickers and returns Map keyed by uppercase ticker", async () => {
    const { getCryptoQuotesBatch } = await freshPrices();
    const out = await getCryptoQuotesBatch(["btc", "BTC", "eth"]);
    expect(out.get("BTC")?.price).toBe(70000);
    expect(out.get("ETH")?.price).toBe(3500);
  });

  it("respects 60s TTL — second call within TTL makes no HTTP call", async () => {
    const { getCryptoQuotesBatch } = await freshPrices();
    let hits = 0;
    server.use(
      http.get("https://api.coingecko.com/api/v3/simple/price", () => {
        hits++;
        return HttpResponse.json({ bitcoin: { usd: 70000, usd_24h_change: 1, last_updated_at: 1 } });
      }),
    );
    await getCryptoQuotesBatch(["BTC"]);
    await getCryptoQuotesBatch(["BTC"]);
    expect(hits).toBe(1);
  });

  it("shares inflight promise — parallel callers → 1 fetch", async () => {
    const { getCryptoQuotesBatch } = await freshPrices();
    let hits = 0;
    server.use(
      http.get("https://api.coingecko.com/api/v3/simple/price", async () => {
        hits++;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({ bitcoin: { usd: 70000, usd_24h_change: 1, last_updated_at: 1 } });
      }),
    );
    await Promise.all([getCryptoQuotesBatch(["BTC"]), getCryptoQuotesBatch(["BTC"])]);
    expect(hits).toBe(1);
  });

  it("falls back to stale cache on fetch error", async () => {
    const { getCryptoQuotesBatch } = await freshPrices();
    // 1st call: success, fills cache
    await getCryptoQuotesBatch(["BTC"]);
    // wait > TTL: forge a clock jump
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    // 2nd call: handler 500s, code should return stale cached map
    server.use(
      http.get("https://api.coingecko.com/api/v3/simple/price", () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const out = await getCryptoQuotesBatch(["BTC"]);
    expect(out.get("BTC")?.price).toBe(70000);
    vi.useRealTimers();
  });

  it("uses lowercased ticker as id for unknown crypto symbols", async () => {
    const { getCryptoQuotesBatch } = await freshPrices();
    let calledIds: string | null = null;
    server.use(
      http.get("https://api.coingecko.com/api/v3/simple/price", ({ request }) => {
        const url = new URL(request.url);
        calledIds = url.searchParams.get("ids");
        return HttpResponse.json({ foobar: { usd: 1, usd_24h_change: 0, last_updated_at: 1 } });
      }),
    );
    await getCryptoQuotesBatch(["FOOBAR"]);
    expect(calledIds).toBe("foobar");
  });
});

describe("getUsdTwd", () => {
  it("returns 32 when Yahoo TWD=X fails", async () => {
    const { getUsdTwd } = await freshPrices();
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/:symbol", () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    expect(await getUsdTwd()).toBe(32);
  });

  it("returns the live rate when Yahoo responds", async () => {
    const { getUsdTwd } = await freshPrices();
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/:symbol", () =>
        HttpResponse.json({
          chart: {
            result: [
              {
                meta: { regularMarketPrice: 31.5, chartPreviousClose: 31.6, currency: "TWD", regularMarketTime: 1 },
              },
            ],
          },
        }),
      ),
    );
    expect(await getUsdTwd()).toBe(31.5);
  });
});
