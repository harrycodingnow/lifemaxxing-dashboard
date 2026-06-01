// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/recurring/route";
import { seedDb } from "../helpers/db";

describe("GET /api/recurring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("returns zeros + nulls when no DCA rows", async () => {
    const json = await (await GET()).json();
    expect(json.runs).toBe(0);
    expect(json.totalBtc).toBe(0);
    expect(json.avgCost).toBeNull();
    expect(json.last_run_ts).toBeNull();
    expect(json.next_run_ts).toBeNull();
  });

  it("aggregates DCA buys; ts in seconds → ms; P&L math", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    seedDb({ trades: [
      // crypto buys with note containing 'daily DCA', ts in SECONDS
      { ts: nowSec - 86400, asset_type: "crypto", symbol: "BTC", side: "buy", quantity: 0.001, price: 60000, currency: "USD", note: "lifemaxx daily DCA" },
      { ts: nowSec,         asset_type: "crypto", symbol: "BTC", side: "buy", quantity: 0.001, price: 70000, currency: "USD", note: "lifemaxx daily DCA" },
    ]});
    const json = await (await GET()).json();
    expect(json.runs).toBe(2);
    expect(json.totalBtc).toBeCloseTo(0.002);
    expect(json.totalUsdSpent).toBeCloseTo(130);
    expect(json.avgCost).toBeCloseTo(65000);
    // FIXED: route now uses q.get("BTC") (was q["BTC"] which silently returned undefined).
    expect(json.currentPrice).toBe(70000);
    expect(json.marketValue).toBeCloseTo(140);   // 0.002 * 70000
    expect(json.pnl).toBeCloseTo(10);            // 140 - 130
    expect(json.pnlPct).toBeCloseTo((10 / 130) * 100);
    // last_run_ts normalised to ms (>1e12)
    expect(json.last_run_ts).toBeGreaterThan(1e12);
    expect(json.next_run_ts).toBe(json.last_run_ts + 86400_000);
    expect(json.history).toHaveLength(2);
  });

  it("ignores trades without DCA note and soft-deleted ones", async () => {
    const now = Date.now();
    seedDb({ trades: [
      { ts: now, asset_type: "crypto", symbol: "BTC", side: "buy", quantity: 0.5, price: 60000, currency: "USD", note: "manual" },
      { ts: now, asset_type: "crypto", symbol: "BTC", side: "buy", quantity: 1, price: 60000, currency: "USD", note: "lifemaxx daily DCA", deleted_at: now },
    ]});
    const json = await (await GET()).json();
    expect(json.runs).toBe(0);
  });
});
