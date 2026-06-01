// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/stats/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb } from "../helpers/db";

describe("GET /api/stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("returns zero streaks + zero cashflow when empty", async () => {
    const json = await (await GET(makeRequest("/api/stats?window=7&tz=0"))).json();
    expect(json.cashflow.buys_usd).toBe(0);
    expect(json.cashflow.sells_usd).toBe(0);
    expect(json.cashflow.trade_count).toBe(0);
    expect(json.streaks.meal_log).toBe(0);
    expect(json.streaks.dca).toBe(0);
    expect(json.streaks.weigh_in).toBe(0);
    expect(json.today_ymd).toBe("2026-06-01");
  });

  it("counts consecutive day meal streak ending today", async () => {
    const today = Date.UTC(2026, 5, 1, 12);
    seedDb({ meals: [
      { ts: today, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 },
      { ts: today - 86400_000, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 },
      { ts: today - 2 * 86400_000, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 },
      // gap
      { ts: today - 5 * 86400_000, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 },
    ]});
    const json = await (await GET(makeRequest("/api/stats?window=30&tz=0"))).json();
    expect(json.streaks.meal_log).toBe(3);
  });

  it("cashflow buys/sells aggregated USD; TWD divided by fx_used", async () => {
    seedDb({
      settings: { usd_twd_cache: "30" },
      trades: [
        { ts: Date.now(), asset_type: "us_stock", symbol: "AAPL", side: "buy",  quantity: 1, price: 100, currency: "USD" },
        { ts: Date.now(), asset_type: "tw_stock", symbol: "0050.TW", side: "buy", quantity: 1, price: 300, currency: "TWD" }, // +10 USD
        { ts: Date.now(), asset_type: "us_stock", symbol: "AAPL", side: "sell", quantity: 1, price: 50,  currency: "USD" },
      ],
    });
    const json = await (await GET(makeRequest("/api/stats?window=7&tz=0"))).json();
    expect(json.cashflow.fx_used).toBe(30);
    expect(json.cashflow.buys_usd).toBeCloseTo(110);
    expect(json.cashflow.sells_usd).toBe(50);
    expect(json.cashflow.net_usd).toBeCloseTo(60);
  });
});
