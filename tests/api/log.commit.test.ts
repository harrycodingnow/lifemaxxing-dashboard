// @vitest-environment node
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/log/commit/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { getDb } from "../helpers/db";

const TRADE_PAYLOAD = {
  asset_type: "us_stock", symbol: "AAPL", display_name: "Apple",
  side: "buy", quantity: 2, price: 200, currency: "USD", note: "",
};
const MEAL_PAYLOAD = {
  meal_type: "lunch",
  items: [{ name: "rice", portion: "1 bowl", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 }],
  totals: { calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 },
  sources: ["USDA"],
};
const WEIGHT_PAYLOAD = { weight_kg: 72.5, note: "morning" };

describe("POST /api/log/commit", () => {
  it("400 when kind missing", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
  });

  it("writes a trade + chat_log user+assistant", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "trade", payload: TRADE_PAYLOAD, text: "buy 2 AAPL",
    }}));
    expect(res.status).toBe(200);
    const json = await jsonOf(res);
    expect(json.id).toBeTruthy();
    const t = getDb().prepare("SELECT * FROM trades").all();
    expect(t).toHaveLength(1);
    const chat = getDb().prepare("SELECT role FROM chat_log ORDER BY id").all() as { role: string }[];
    expect(chat.map((c) => c.role)).toEqual(["user", "assistant"]);
  });

  it("writes a meal row", async () => {
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "meal", payload: MEAL_PAYLOAD, text: "rice",
    }}));
    const m = getDb().prepare("SELECT description, calories, items_json FROM meals").get() as any;
    expect(m.description).toBe("rice");
    expect(m.calories).toBe(200);
    expect(JSON.parse(m.items_json)).toHaveLength(1);
  });

  it("writes a weight row", async () => {
    await POST(makeRequest("/x", { method: "POST", body: {
      kind: "weight", payload: WEIGHT_PAYLOAD, text: "73",
    }}));
    const w = getDb().prepare("SELECT weight_kg, note FROM weights").get() as any;
    expect(w.weight_kg).toBe(72.5);
    expect(w.note).toBe("morning");
  });

  it("batch: partial success — bad entry records error but others succeed", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "batch",
      payload: {
        entries: [
          { kind: "trade", payload: TRADE_PAYLOAD },
          { kind: "weight", payload: WEIGHT_PAYLOAD },
          // bogus kind → writeEntry throws
          { kind: "bogus" as any, payload: {} },
        ],
      },
      text: "do 3 things",
    }}));
    const json = await jsonOf(res);
    expect(json.kind).toBe("batch");
    expect(json.results).toHaveLength(3);
    expect(json.results[0].ok).toBe(true);
    expect(json.results[1].ok).toBe(true);
    expect(json.results[2].ok).toBe(false);
    expect(getDb().prepare("SELECT COUNT(*) c FROM trades").get()).toMatchObject({ c: 1 });
    expect(getDb().prepare("SELECT COUNT(*) c FROM weights").get()).toMatchObject({ c: 1 });
  });

  it("unknown kind returns 400 and writes no row", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: {
      kind: "frobnicate", payload: {}, text: "x",
    }}));
    expect(res.status).toBe(400);
    expect(getDb().prepare("SELECT COUNT(*) c FROM trades").get()).toMatchObject({ c: 0 });
  });
});
