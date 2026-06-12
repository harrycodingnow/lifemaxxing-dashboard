// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/log/commit/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { getDb, seedDb } from "../helpers/db";

describe("POST /api/log/commit — new kinds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("writes a subscription row", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "subscription",
      payload: { name: "Netflix", amount: 390, currency: "TWD", cycle: "monthly", next_charge_ts: null, url: "", notes: "" },
      text: "netflix 390/mo",
    }}));
    expect(res.status).toBe(200);
    const json = await jsonOf(res);
    expect(json.id).toBeTruthy();
    const row = getDb().prepare("SELECT name, amount, cycle FROM subscriptions").get() as any;
    expect(row).toMatchObject({ name: "Netflix", amount: 390, cycle: "monthly" });
  });

  it("habit commit creates the habit on first use, then upserts the day log", async () => {
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "habit", payload: { name: "meditation", status: "done", day: "2026-06-01" }, text: "did meditation",
    }}));
    // habit auto-created
    const h = getDb().prepare("SELECT id, name FROM habits").get() as { id: number; name: string };
    expect(h.name).toBe("meditation");
    let log = getDb().prepare("SELECT status FROM habit_logs WHERE habit_id=? AND day='2026-06-01'").get(h.id) as { status: string };
    expect(log.status).toBe("done");

    // second commit same habit/day flips to skip via upsert (no dup row)
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "habit", payload: { name: "meditation", status: "skip", day: "2026-06-01" }, text: "skipped meditation",
    }}));
    expect(getDb().prepare("SELECT COUNT(*) c FROM habits").get()).toMatchObject({ c: 1 }); // not duplicated
    expect(getDb().prepare("SELECT COUNT(*) c FROM habit_logs").get()).toMatchObject({ c: 1 });
    log = getDb().prepare("SELECT status FROM habit_logs WHERE habit_id=? AND day='2026-06-01'").get(h.id) as { status: string };
    expect(log.status).toBe("skip");
  });

  it("habit commit reuses an existing habit by name (case-insensitive)", async () => {
    seedDb({ habits: [{ name: "meditation" }] });
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "habit", payload: { name: "Meditation", status: "done", day: "2026-06-01" }, text: "did meditation",
    }}));
    expect(getDb().prepare("SELECT COUNT(*) c FROM habits").get()).toMatchObject({ c: 1 });
  });

  it("networth cash commit writes to cash_accounts", async () => {
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "networth", payload: { kind: "cash", name: "Cathay", balance: 250000, currency: "TWD", account_kind: "bank" }, text: "cathay 250000",
    }}));
    const row = getDb().prepare("SELECT name, balance, kind FROM cash_accounts").get() as any;
    expect(row).toMatchObject({ name: "Cathay", balance: 250000, kind: "bank" });
    expect(getDb().prepare("SELECT COUNT(*) c FROM liabilities").get()).toMatchObject({ c: 0 });
  });

  it("networth liability commit writes to liabilities with positive balance", async () => {
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "networth", payload: { kind: "liability", name: "Loan", balance: -50000, currency: "TWD", account_kind: "loan" }, text: "loan -50000",
    }}));
    const row = getDb().prepare("SELECT name, balance, kind FROM liabilities").get() as any;
    expect(row).toMatchObject({ name: "Loan", balance: 50000, kind: "loan" });
  });

  it("subscription missing name throws → 400, no row", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "subscription", payload: { amount: 100 }, text: "x",
    }}));
    expect(res.status).toBe(400);
    expect(getDb().prepare("SELECT COUNT(*) c FROM subscriptions").get()).toMatchObject({ c: 0 });
  });

  it("batch can mix a habit + a subscription", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "batch",
      payload: { entries: [
        { kind: "habit", payload: { name: "gym", status: "done", day: "2026-06-01" } },
        { kind: "subscription", payload: { name: "Spotify", amount: 1990, currency: "TWD", cycle: "yearly" } },
      ]},
      text: "did gym; spotify 1990/yr",
    }}));
    const json = await jsonOf(res);
    expect(json.results.filter((r: any) => r.ok)).toHaveLength(2);
    expect(getDb().prepare("SELECT COUNT(*) c FROM habit_logs").get()).toMatchObject({ c: 1 });
    expect(getDb().prepare("SELECT COUNT(*) c FROM subscriptions").get()).toMatchObject({ c: 1 });
  });
});
