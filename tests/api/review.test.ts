// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET, buildWeeklyDigest } from "@/app/api/review/weekly/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { seedDb } from "../helpers/db";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";

describe("weekly review", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T12:00:00Z"));
    resetHermesResponder();
  });

  it("buildWeeklyDigest aggregates the trailing window from the DB only", () => {
    const now = Date.now();
    seedDb({
      trades: [
        { ts: now - 86400_000, side: "buy", asset_type: "crypto", symbol: "BTC", display_name: "Bitcoin", quantity: 0.01, price: 70000, currency: "USD" },
        { ts: now - 2 * 86400_000, side: "sell", asset_type: "us_stock", symbol: "AAPL", display_name: "Apple", quantity: 1, price: 200, currency: "USD" },
        { ts: now - 30 * 86400_000, side: "buy", asset_type: "us_stock", symbol: "NVDA", quantity: 1, price: 400, currency: "USD" }, // outside window
      ],
      meals: [
        { ts: now, calories: 600, protein_g: 40, carbs_g: 50, fat_g: 20 },
        { ts: now - 86400_000, calories: 800, protein_g: 60, carbs_g: 70, fat_g: 25 },
      ],
      weights: [
        { ts: now - 6 * 86400_000, weight_kg: 73.0 },
        { ts: now, weight_kg: 72.4 },
      ],
    });
    const d = buildWeeklyDigest(7);
    expect(d.trades.count).toBe(2); // NVDA excluded (outside 7d)
    expect(d.trades.buys).toBe(1);
    expect(d.trades.sells).toBe(1);
    expect(d.nutrition.meals_logged).toBe(2);
    expect(d.nutrition.days_logged).toBe(2);
    expect(d.weight.delta_kg).toBeCloseTo(-0.6);
  });

  it("GET with summary=0 returns the digest and no Hermes call", async () => {
    seedDb({ meals: [{ ts: Date.now(), calories: 500, protein_g: 30, carbs_g: 40, fat_g: 15 }] });
    const json = await jsonOf(await GET(makeRequest("/api/review/weekly?window=7&summary=0")));
    expect(json.digest.nutrition.meals_logged).toBe(1);
    expect(json.summary).toBeNull();
  });

  it("GET with summary returns the Hermes-generated text", async () => {
    setHermesResponder(() => "Solid week. • Logged 1 meal.");
    seedDb({ meals: [{ ts: Date.now(), calories: 500, protein_g: 30, carbs_g: 40, fat_g: 15 }] });
    const json = await jsonOf(await GET(makeRequest("/api/review/weekly?window=7")));
    expect(json.summary).toContain("Solid week");
    expect(json.summary_error).toBeNull();
  });

  it("GET surfaces summary_error if Hermes throws but still returns the digest", async () => {
    setHermesResponder(() => { throw new Error("hermes timeout"); });
    const json = await jsonOf(await GET(makeRequest("/api/review/weekly?window=7")));
    expect(json.summary).toBeNull();
    expect(json.summary_error).toContain("hermes timeout");
    expect(json.digest).toBeTruthy();
  });
});
