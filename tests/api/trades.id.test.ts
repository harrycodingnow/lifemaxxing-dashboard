// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PATCH, DELETE } from "@/app/api/trades/[id]/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb, getDb } from "../helpers/db";

function ctx(id: number | string) { return { params: Promise.resolve({ id: String(id) }) }; }

describe("/api/trades/[id]", () => {
  it("PATCH whitelists fields; rejects unknown id", async () => {
    seedDb({ trades: [{ symbol: "AAPL", quantity: 1, price: 100, currency: "USD" }] });
    const id = (getDb().prepare("SELECT id FROM trades").get() as any).id;
    const res = await PATCH(makeRequest("/x", { method: "PATCH", body: { price: 250, evil: 1 } }), ctx(id));
    expect(res.status).toBe(200);
    const row = getDb().prepare("SELECT price FROM trades WHERE id=?").get(id) as any;
    expect(row.price).toBe(250);

    const bad = await PATCH(makeRequest("/x", { method: "PATCH", body: { price: 1 } }), ctx("nan"));
    expect(bad.status).toBe(400);
    const notFound = await PATCH(makeRequest("/x", { method: "PATCH", body: { price: 1 } }), ctx(999999));
    expect(notFound.status).toBe(404);
  });

  it("DELETE soft-deletes (deleted_at set, row preserved)", async () => {
    seedDb({ trades: [{ symbol: "AAPL", quantity: 1, price: 100, currency: "USD" }] });
    const id = (getDb().prepare("SELECT id FROM trades").get() as any).id;
    const res = await DELETE(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(res.status).toBe(200);
    const row = getDb().prepare("SELECT deleted_at FROM trades WHERE id=?").get(id) as any;
    expect(row.deleted_at).toBeTruthy(); // row preserved (SOUL: no hard deletes)
  });
});
