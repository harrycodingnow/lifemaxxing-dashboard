// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/log/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";
import { getDb } from "../helpers/db";
import {
  ROUTER_TRADE, ROUTER_MEAL, ROUTER_WEIGHT, ROUTER_BATCH,
  ROUTER_QUESTION, ROUTER_UNKNOWN,
  TRADE_PARSED, MEAL_PARSED, WEIGHT_PARSED, BATCH_PARSED,
} from "../fixtures/hermes";

beforeEach(() => resetHermesResponder());

function route(prompt: string): string {
  // Pick canned response based on which production prompt was sent
  if (prompt.includes("strict JSON router")) return ROUTER_TRADE;
  if (prompt.includes("Parse this trade")) return TRADE_PARSED;
  if (prompt.includes("nutrition research")) return MEAL_PARSED;
  if (prompt.includes("body-weight log entry")) return WEIGHT_PARSED;
  if (prompt.includes("MULTIPLE separate entries")) return BATCH_PARSED;
  throw new Error("unrecognized prompt: " + prompt.slice(0, 60));
}

describe("POST /api/log", () => {
  it("returns 400 on empty text", async () => {
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "" } }));
    expect(res.status).toBe(400);
  });

  it("trade intent → returns preview + payload, NO DB write", async () => {
    setHermesResponder(route);
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "buy 2 AAPL @ 200" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("trade");
    expect(json.needsConfirm).toBe(true);
    expect(json.payload.symbol).toBe("AAPL");
    expect(json.preview).toMatch(/BUY 2/);
    expect(getDb().prepare("SELECT COUNT(*) c FROM trades").get()).toMatchObject({ c: 0 });
  });

  it("meal intent → returns kcal preview", async () => {
    setHermesResponder((p) => (p.includes("router") ? ROUTER_MEAL : route(p)));
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "chicken and rice" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("meal");
    expect(json.preview).toMatch(/kcal/);
  });

  it("weight intent → regex fast-path skips hermes for kg input", async () => {
    let calls = 0;
    setHermesResponder((p) => {
      calls++;
      if (p.includes("router")) return ROUTER_WEIGHT;
      throw new Error("should not call weight parser — regex covers it");
    });
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "weight 73.4 kg" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("weight");
    expect(json.payload.weight_kg).toBe(73.4);
    expect(calls).toBe(1); // only router
  });

  it("weight intent → falls back to Hermes parser when regex misses", async () => {
    setHermesResponder((p) => {
      if (p.includes("strict JSON router")) return ROUTER_WEIGHT;
      if (p.includes("body-weight log entry")) return WEIGHT_PARSED;
      throw new Error("unexpected: " + p.slice(0, 60));
    });
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "i weigh about half my dog" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("weight");
    expect(json.payload.weight_kg).toBe(72.5); // from fixture
  });

  it("batch intent → returns N entries preview", async () => {
    setHermesResponder((p) => (p.includes("strict JSON router") ? ROUTER_BATCH : route(p)));
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "buy btc and weight 72.5" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("batch");
    expect(json.payload.entries).toHaveLength(2);
    expect(json.needsConfirm).toBe(true);
  });

  it("question intent → writes to chat_log + needsConfirm:false", async () => {
    setHermesResponder(() => ROUTER_QUESTION);
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "what is my net worth?" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("question");
    expect(json.needsConfirm).toBe(false);
    const rows = getDb().prepare("SELECT role FROM chat_log ORDER BY id").all() as { role: string }[];
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
  });

  it("unknown intent → writes chat_log w/ apologetic assistant reply", async () => {
    setHermesResponder(() => ROUTER_UNKNOWN);
    const res = await POST(makeRequest("/api/log", { method: "POST", body: { text: "asdfg" } }));
    const json = await jsonOf(res);
    expect(json.kind).toBe("unknown");
    const last = getDb().prepare("SELECT text FROM chat_log WHERE role='assistant' ORDER BY id DESC LIMIT 1").get() as { text: string };
    expect(last.text).toMatch(/Not sure/i);
  });
});
