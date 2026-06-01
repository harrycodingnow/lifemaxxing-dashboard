// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/portfolio/route";
import { seedDb, getDb } from "../helpers/db";

describe("GET /api/portfolio", () => {
  it("returns empty totals when no trades", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.positions).toEqual([]);
    expect(json.totals.market_value_usd).toBe(0);
    expect(json.totals.cost_usd).toBe(0);
    expect(json.fx.usd_twd).toBe(32);
  });

  it("avg-cost reducer: buy-buy-sell leaves correct quantity + cost basis", async () => {
    seedDb({ trades: [
      { ts: 1, asset_type: "us_stock", symbol: "AAPL", display_name: "Apple", side: "buy",  quantity: 10, price: 100, currency: "USD" },
      { ts: 2, asset_type: "us_stock", symbol: "AAPL", display_name: "Apple", side: "buy",  quantity: 10, price: 200, currency: "USD" },
      // avg = 150; sell 5 → cost basis reduced by 150*5 = 750
      { ts: 3, asset_type: "us_stock", symbol: "AAPL", display_name: "Apple", side: "sell", quantity: 5,  price: 250, currency: "USD" },
    ]});
    const json = await (await GET()).json();
    const aapl = json.positions.find((p: any) => p.symbol === "AAPL");
    expect(aapl.quantity).toBeCloseTo(15);
    // remaining cost basis = (10*100 + 10*200) - 150*5 = 3000 - 750 = 2250
    expect(aapl.avg_cost).toBeCloseTo(150);
    // price from MSW = 200, market value = 200*15 = 3000
    expect(aapl.current_price).toBe(200);
    expect(aapl.market_value_native).toBeCloseTo(3000);
  });

  it("positions with quantity < 1e-9 are dropped", async () => {
    seedDb({ trades: [
      { ts: 1, asset_type: "us_stock", symbol: "AAPL", side: "buy",  quantity: 1, price: 100, currency: "USD" },
      { ts: 2, asset_type: "us_stock", symbol: "AAPL", side: "sell", quantity: 1, price: 110, currency: "USD" },
    ]});
    const json = await (await GET()).json();
    expect(json.positions).toEqual([]);
  });

  it("missing live price → totals fall back to cost", async () => {
    seedDb({ trades: [
      // ZZZZ has no MSW handler → Yahoo returns 404 → quote throws → price=null
      { ts: 1, asset_type: "us_stock", symbol: "ZZZZ", display_name: "Z", side: "buy", quantity: 1, price: 500, currency: "USD" },
    ]});
    const json = await (await GET()).json();
    const z = json.positions[0];
    expect(z.current_price).toBeNull();
    expect(z.market_value_native).toBeNull();
    // total should still reflect cost ($500)
    expect(json.totals.market_value_usd).toBeCloseTo(500);
  });

  it("TWD position is converted via usdTwd=32 in totals", async () => {
    seedDb({ trades: [
      { ts: 1, asset_type: "tw_stock", symbol: "2330.TW", display_name: "TSMC", side: "buy", quantity: 1, price: 1000, currency: "TWD" },
    ]});
    const json = await (await GET()).json();
    // 1 share @ 1000 TWD, current price 1000 TWD → 1000 TWD / 32 = 31.25 USD
    expect(json.totals.market_value_usd).toBeCloseTo(1000 / 32, 4);
  });

  it("soft-deleted trades are excluded", async () => {
    seedDb({ trades: [
      { ts: 1, asset_type: "us_stock", symbol: "AAPL", side: "buy", quantity: 5, price: 100, currency: "USD", deleted_at: Date.now() },
    ]});
    const json = await (await GET()).json();
    expect(json.positions).toEqual([]);
    expect(json.trade_count).toBe(0);
  });
});
