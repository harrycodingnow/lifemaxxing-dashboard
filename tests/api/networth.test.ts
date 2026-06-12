// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET as CASH_GET, POST as CASH_POST } from "@/app/api/cash/route";
import { PATCH as CASH_PATCH, DELETE as CASH_DELETE } from "@/app/api/cash/[id]/route";
import { POST as LIAB_POST } from "@/app/api/liabilities/route";
import { PATCH as LIAB_PATCH } from "@/app/api/liabilities/[id]/route";
import { GET as NW_GET } from "@/app/api/networth/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { getDb, seedDb } from "../helpers/db";

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("cash accounts", () => {
  it("POST creates, GET lists active only", async () => {
    await CASH_POST(makeRequest("/x", { method: "POST", body: { name: "Cathay", balance: 250000, currency: "TWD", kind: "bank" } }));
    seedDb({ cash_accounts: [{ name: "Archived", balance: 100, archived_at: Date.now() }] });
    const json = await jsonOf(await CASH_GET(makeRequest("/api/cash")));
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].name).toBe("Cathay");
  });

  it("POST 400 on non-numeric balance", async () => {
    const res = await CASH_POST(makeRequest("/x", { method: "POST", body: { name: "X", balance: "lots" } }));
    expect(res.status).toBe(400);
  });

  it("PATCH updates balance; DELETE soft-archives", async () => {
    seedDb({ cash_accounts: [{ name: "Cathay", balance: 250000 }] });
    await CASH_PATCH(makeRequest("/x", { method: "PATCH", body: { balance: 300000 } }), ctx(1));
    expect((getDb().prepare("SELECT balance FROM cash_accounts WHERE id=1").get() as { balance: number }).balance).toBe(300000);
    const del = await jsonOf(await CASH_DELETE(makeRequest("/x", { method: "DELETE" }), ctx(1)));
    expect(del.archived).toBe(true);
    expect(getDb().prepare("SELECT COUNT(*) c FROM cash_accounts").get()).toMatchObject({ c: 1 });
  });
});

describe("liabilities", () => {
  it("stores debt as a positive number even if entered negative", async () => {
    const json = await jsonOf(await LIAB_POST(makeRequest("/x", { method: "POST", body: { name: "Student loan", balance: -50000, kind: "loan" } })));
    expect(json.row.balance).toBe(50000);
  });

  it("PATCH keeps debt positive", async () => {
    seedDb({ liabilities: [{ name: "Loan", balance: 50000 }] });
    const json = await jsonOf(await LIAB_PATCH(makeRequest("/x", { method: "PATCH", body: { balance: -40000 } }), ctx(1)));
    expect(json.row.balance).toBe(40000);
  });
});

describe("GET /api/networth", () => {
  it("net worth = portfolio + cash − liabilities in USD and TWD (no trades → portfolio 0)", async () => {
    // No trades, so portfolio fetch loop is skipped and portfolio_ok stays true.
    seedDb({
      settings: { usd_twd_cache: "30" },
      cash_accounts: [
        { name: "Cathay", balance: 300000, currency: "TWD" }, // 10000 USD @30
        { name: "BoA", balance: 5000, currency: "USD" },
      ],
      liabilities: [
        { name: "Loan", balance: 60000, currency: "TWD" }, // 2000 USD @30
      ],
    });
    const json = await jsonOf(await NW_GET(makeRequest("/api/networth")));
    // FX comes from live getUsdTwd() (mocked via MSW: TWD=X). Use the returned fx for math.
    const fx = json.fx.usd_twd;
    const expectCashUsd = 300000 / fx + 5000;
    const expectLiabUsd = 60000 / fx;
    expect(json.components.cash.usd).toBeCloseTo(expectCashUsd, 4);
    expect(json.components.liabilities.usd).toBeCloseTo(expectLiabUsd, 4);
    expect(json.components.portfolio.usd).toBe(0);
    expect(json.net_worth.usd).toBeCloseTo(expectCashUsd - expectLiabUsd, 4);
    expect(json.net_worth.twd).toBeCloseTo((expectCashUsd - expectLiabUsd) * fx, 2);
    expect(json.counts).toMatchObject({ cash: 2, liabilities: 1 });
  });

  it("returns zeros with no data", async () => {
    const json = await jsonOf(await NW_GET(makeRequest("/api/networth")));
    expect(json.net_worth.usd).toBe(0);
    expect(json.components.cash.usd).toBe(0);
  });
});
