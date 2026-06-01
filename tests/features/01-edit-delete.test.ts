// @vitest-environment node
// Feature 1 — Edit / soft-delete trades, meals, weights
// Shipped: DELETE soft-deletes via deleted_at on /api/{trades,meals,weights}/[id].
// PATCH whitelist on /api/trades/[id] and /api/meals/[id]. UI affordance bits
// (in-row edit, undo toast) are not yet shipped → .todo.

import { describe, it, expect } from "vitest";
import { DELETE as delTrade } from "@/app/api/trades/[id]/route";
import { DELETE as delMeal } from "@/app/api/meals/[id]/route";
import { DELETE as delWeight } from "@/app/api/weights/[id]/route";
import { seedDb, getDb } from "../helpers/db";
import { makeRequest } from "../helpers/makeRequest";

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("Feature 1 — soft-delete sets deleted_at on all three tables", () => {
  it("DELETE /api/trades/[id] flips deleted_at", async () => {
    seedDb({ trades: [{ ts: Date.now(), asset_type: "us_stock", symbol: "AAPL", side: "buy", quantity: 1, price: 100, currency: "USD" }] });
    const id = (getDb().prepare("SELECT id FROM trades").get() as any).id;
    const r = await delTrade(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(r.status).toBe(200);
    expect((getDb().prepare("SELECT deleted_at FROM trades WHERE id=?").get(id) as any).deleted_at).not.toBeNull();
  });
  it("DELETE /api/meals/[id] flips deleted_at", async () => {
    seedDb({ meals: [{ calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }] });
    const id = (getDb().prepare("SELECT id FROM meals").get() as any).id;
    const r = await delMeal(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(r.status).toBe(200);
  });
  it("DELETE /api/weights/[id] flips deleted_at", async () => {
    seedDb({ weights: [{ weight_kg: 70 }] });
    const id = (getDb().prepare("SELECT id FROM weights").get() as any).id;
    const r = await delWeight(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(r.status).toBe(200);
  });
});

describe.skip("Feature 1 — UI affordances (not shipped)", () => {
  it.todo("TODO(feature-1): in-row edit icon opens EditModal pre-populated");
  it.todo("TODO(feature-1): undo toast restores deleted_at=NULL within 5s");
  it.todo("TODO(feature-1): keyboard shortcut 'e' on hover focuses edit");
});
