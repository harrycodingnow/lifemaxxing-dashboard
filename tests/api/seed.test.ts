// @vitest-environment node
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/seed/route";
import { makeRequest } from "../helpers/makeRequest";
import { getDb, seedDb } from "../helpers/db";

describe("POST /api/seed", () => {
  it("idempotent: skips symbols already seeded (note='seed:initial')", async () => {
    seedDb({ trades: [
      { asset_type: "us_stock", symbol: "GOOGL", side: "buy", quantity: 1, price: 100, currency: "USD", note: "seed:initial" },
    ]});
    const res = await POST(makeRequest("/x", { method: "POST", body: { prices: { GOOGL: 180, NVDA: 450, NOW: 1000, ARTY: 50, "0050.TW": 150, "00981A.TW": 20, "00403A.TW": 18, BTC: 70000, ETH: 3500, XRP: 0.5, LINK: 15, USDC: 1 } } }));
    const json = await res.json();
    const googl = json.results.find((r: any) => r.symbol === "GOOGL");
    expect(googl.status).toMatch(/skipped/);
    // others inserted
    const inserted = json.results.filter((r: any) => r.status === "inserted");
    expect(inserted.length).toBeGreaterThan(5);
  });

  it("force:true re-inserts even if already seeded (additive, not destructive)", async () => {
    seedDb({ trades: [
      { asset_type: "us_stock", symbol: "GOOGL", side: "buy", quantity: 1, price: 100, currency: "USD", note: "seed:initial" },
    ]});
    const res = await POST(makeRequest("/x", { method: "POST", body: { force: true, prices: { GOOGL: 180, NVDA: 450, NOW: 1000, ARTY: 50, "0050.TW": 150, "00981A.TW": 20, "00403A.TW": 18, BTC: 70000, ETH: 3500, XRP: 0.5, LINK: 15, USDC: 1 } } }));
    const json = await res.json();
    expect(json.results.find((r: any) => r.symbol === "GOOGL").status).toBe("inserted");
    // pre-existing row still there (not destructive)
    const count = (getDb().prepare("SELECT COUNT(*) c FROM trades WHERE symbol='GOOGL'").get() as any).c;
    expect(count).toBe(2);
  });

  it("falls back to override prices when live quote unavailable", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: { prices: { GOOGL: 999 } } }));
    const json = await res.json();
    const googl = json.results.find((r: any) => r.symbol === "GOOGL");
    expect(googl.status).toBe("inserted");
    expect(googl.price).toBe(999);
  });
});
