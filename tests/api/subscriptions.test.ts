// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET, POST } from "@/app/api/subscriptions/route";
import { PATCH, DELETE } from "@/app/api/subscriptions/[id]/route";
import { monthlyAmount } from "@/app/api/subscriptions/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { getDb, seedDb } from "../helpers/db";

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("monthlyAmount", () => {
  it("normalizes cycles to monthly", () => {
    expect(monthlyAmount(390, "monthly")).toBe(390);
    expect(monthlyAmount(1200, "yearly")).toBe(100);
    expect(monthlyAmount(12, "weekly")).toBeCloseTo(52);
  });
});

describe("GET /api/subscriptions", () => {
  it("returns rows + monthly/yearly burn split by currency", async () => {
    seedDb({
      subscriptions: [
        { name: "Netflix", amount: 390, currency: "TWD", cycle: "monthly" },
        { name: "Spotify", amount: 1990, currency: "TWD", cycle: "yearly" }, // ≈165.83/mo
        { name: "iCloud", amount: 3, currency: "USD", cycle: "monthly" },
      ],
    });
    const json = await jsonOf(await GET(makeRequest("/api/subscriptions")));
    expect(json.rows).toHaveLength(3);
    expect(json.monthly.twd).toBeCloseTo(390 + 1990 / 12);
    expect(json.monthly.usd).toBeCloseTo(3);
    expect(json.yearly.twd).toBeCloseTo((390 + 1990 / 12) * 12);
  });

  it("hides archived rows by default, includes them with ?archived=1", async () => {
    seedDb({
      subscriptions: [
        { name: "Active", amount: 100 },
        { name: "Cancelled", amount: 200, archived_at: Date.now() },
      ],
    });
    const active = await jsonOf(await GET(makeRequest("/api/subscriptions")));
    expect(active.rows).toHaveLength(1);
    expect(active.monthly.twd).toBe(100); // archived excluded from burn
    const all = await jsonOf(await GET(makeRequest("/api/subscriptions?archived=1")));
    expect(all.rows).toHaveLength(2);
  });
});

describe("POST /api/subscriptions", () => {
  it("creates a subscription", async () => {
    const json = await jsonOf(await POST(makeRequest("/api/subscriptions", {
      method: "POST", body: { name: "Netflix", amount: 390, cycle: "monthly", currency: "TWD" },
    })));
    expect(json.row.name).toBe("Netflix");
    expect(json.row.amount).toBe(390);
    expect(getDb().prepare("SELECT COUNT(*) c FROM subscriptions").get()).toMatchObject({ c: 1 });
  });

  it("400 on missing name", async () => {
    const res = await POST(makeRequest("/api/subscriptions", { method: "POST", body: { amount: 10 } }));
    expect(res.status).toBe(400);
  });

  it("400 on negative amount", async () => {
    const res = await POST(makeRequest("/api/subscriptions", { method: "POST", body: { name: "X", amount: -5 } }));
    expect(res.status).toBe(400);
  });

  it("defaults invalid cycle to monthly and bad currency to TWD", async () => {
    const json = await jsonOf(await POST(makeRequest("/api/subscriptions", {
      method: "POST", body: { name: "X", amount: 10, cycle: "fortnightly", currency: "EUR" },
    })));
    expect(json.row.cycle).toBe("monthly");
    expect(json.row.currency).toBe("TWD");
  });
});

describe("PATCH/DELETE /api/subscriptions/[id]", () => {
  it("patches amount", async () => {
    seedDb({ subscriptions: [{ name: "Netflix", amount: 390 }] });
    const json = await jsonOf(await PATCH(makeRequest("/x", { method: "PATCH", body: { amount: 490 } }), ctx(1)));
    expect(json.row.amount).toBe(490);
  });

  it("soft-archives (no hard delete)", async () => {
    seedDb({ subscriptions: [{ name: "Netflix", amount: 390 }] });
    const json = await jsonOf(await DELETE(makeRequest("/x", { method: "DELETE" }), ctx(1)));
    expect(json.archived).toBe(true);
    const row = getDb().prepare("SELECT archived_at FROM subscriptions WHERE id=1").get() as { archived_at: number | null };
    expect(row.archived_at).toBeTruthy();
    // row still present — never hard-deleted
    expect(getDb().prepare("SELECT COUNT(*) c FROM subscriptions").get()).toMatchObject({ c: 1 });
  });

  it("404 patching a missing id", async () => {
    const res = await PATCH(makeRequest("/x", { method: "PATCH", body: { amount: 1 } }), ctx(999));
    expect(res.status).toBe(404);
  });
});
