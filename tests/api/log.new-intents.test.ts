// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/log/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";
import { getDb } from "../helpers/db";

beforeEach(() => resetHermesResponder());

// Canned router + parser responses for the new intents.
const ROUTER_SUB = `{"intent":"subscription","reason":"recurring price"}`;
const ROUTER_HABIT = `{"intent":"habit","reason":"daily routine"}`;
const ROUTER_NW = `{"intent":"networth","reason":"balance"}`;
const SUB_PARSED = JSON.stringify({ name: "Netflix", amount: 390, currency: "TWD", cycle: "monthly", next_charge_iso: "", url: "", notes: "" });
const HABIT_PARSED = JSON.stringify({ name: "meditation", status: "done" });
const NW_CASH_PARSED = JSON.stringify({ kind: "cash", name: "Cathay", balance: 250000, currency: "TWD", account_kind: "bank" });
const NW_LIAB_PARSED = JSON.stringify({ kind: "liability", name: "Student loan", balance: 50000, currency: "TWD", account_kind: "loan" });

describe("POST /api/log — new intents (parse only, no DB write)", () => {
  it("habit fast-path: 'did meditation' → habit, ZERO hermes calls", async () => {
    let calls = 0;
    setHermesResponder(() => { calls++; throw new Error("should not call hermes"); });
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "did meditation" } })));
    expect(json.kind).toBe("habit");
    expect(json.payload).toMatchObject({ name: "meditation", status: "done" });
    expect(json.needsConfirm).toBe(true);
    expect(calls).toBe(0);
  });

  it("habit fast-path: 'skipped gym' → status skip", async () => {
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "skipped gym" } })));
    expect(json.kind).toBe("habit");
    expect(json.payload.status).toBe("skip");
    expect(json.payload.name).toBe("gym");
  });

  it("habit fast-path: Chinese '完成 跑步'", async () => {
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "完成 跑步" } })));
    expect(json.kind).toBe("habit");
    expect(json.payload.status).toBe("done");
    expect(json.payload.name).toBe("跑步");
  });

  it("subscription prefix fast-path: 'sub: netflix 390/mo' → ZERO hermes calls", async () => {
    let calls = 0;
    setHermesResponder(() => { calls++; throw new Error("no hermes"); });
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "sub: netflix 390/mo" } })));
    expect(json.kind).toBe("subscription");
    expect(json.payload.amount).toBe(390);
    expect(json.payload.cycle).toBe("monthly");
    expect(calls).toBe(0);
  });

  it("subscription LLM intent: 'spotify membership' → routed + parsed", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_SUB : SUB_PARSED));
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "track my spotify membership" } })));
    expect(json.kind).toBe("subscription");
    expect(json.payload.name).toBe("Netflix"); // from fixture
  });

  it("habit LLM intent path when router picks habit (non fast-path wording)", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_HABIT : HABIT_PARSED));
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "got my meditation in this morning" } })));
    expect(json.kind).toBe("habit");
    expect(json.payload).toMatchObject({ name: "meditation", status: "done" });
  });

  it("networth intent: cash", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_NW : NW_CASH_PARSED));
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "cathay savings balance 250000" } })));
    expect(json.kind).toBe("networth");
    expect(json.payload).toMatchObject({ kind: "cash", name: "Cathay", balance: 250000 });
  });

  it("networth intent: liability stores positive balance", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_NW : NW_LIAB_PARSED));
    const json = await jsonOf(await POST(makeRequest("/api/log", { method: "POST", body: { text: "student loan -50000" } })));
    expect(json.kind).toBe("networth");
    expect(json.payload.kind).toBe("liability");
    expect(json.payload.balance).toBe(50000);
  });

  it("none of these wrote to the DB (parse-only contract)", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_NW : NW_CASH_PARSED));
    await POST(makeRequest("/api/log", { method: "POST", body: { text: "cathay 250000" } }));
    expect(getDb().prepare("SELECT COUNT(*) c FROM cash_accounts").get()).toMatchObject({ c: 0 });
    expect(getDb().prepare("SELECT COUNT(*) c FROM subscriptions").get()).toMatchObject({ c: 0 });
    expect(getDb().prepare("SELECT COUNT(*) c FROM habit_logs").get()).toMatchObject({ c: 0 });
  });
});
