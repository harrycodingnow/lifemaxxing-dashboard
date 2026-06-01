// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/weight/route";
import { PATCH, DELETE } from "@/app/api/weights/[id]/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb, getDb } from "../helpers/db";

describe("GET /api/weight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("returns 7-day MA + stats with same shape as /api/weights", async () => {
    const now = Date.now();
    seedDb({ weights: [
      { ts: now - 2 * 86400_000, weight_kg: 70 },
      { ts: now,                 weight_kg: 72 },
    ]});
    const json = await (await GET(makeRequest("/api/weight?days=30"))).json();
    expect(json.range_days).toBe(30);
    expect(json.rows).toHaveLength(2);
    expect(json.moving_avg_7d).toHaveLength(2);
    expect(json.stats.delta_kg).toBe(2);
  });
});

describe("PATCH /api/weights/[id]", () => {
  it("updates whitelisted fields, ignores unknowns", async () => {
    const now = Date.now();
    seedDb({ weights: [{ ts: now, weight_kg: 70 }] });
    const id = (getDb().prepare("SELECT id FROM weights").get() as { id: number }).id;
    const res = await PATCH(
      makeRequest("/x", { method: "PATCH", body: { weight_kg: 71.5, sneaky: "x" } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(res.status).toBe(200);
    const row = (getDb().prepare("SELECT weight_kg FROM weights WHERE id=?").get(id)) as any;
    expect(row.weight_kg).toBe(71.5);
  });

  it("400 on bad id, 400 on no valid fields, 404 when missing", async () => {
    const r1 = await PATCH(
      makeRequest("/x", { method: "PATCH", body: { weight_kg: 1 } }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(r1.status).toBe(400);
    seedDb({ weights: [{ ts: 1, weight_kg: 70 }] });
    const id = (getDb().prepare("SELECT id FROM weights").get() as { id: number }).id;
    const r2 = await PATCH(
      makeRequest("/x", { method: "PATCH", body: { unknown: 9 } }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r2.status).toBe(400);
    const r3 = await PATCH(
      makeRequest("/x", { method: "PATCH", body: { weight_kg: 1 } }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(r3.status).toBe(404);
  });
});

describe("DELETE /api/weights/[id]", () => {
  it("soft-deletes via deleted_at", async () => {
    seedDb({ weights: [{ ts: 1, weight_kg: 70 }] });
    const id = (getDb().prepare("SELECT id FROM weights").get() as { id: number }).id;
    const res = await DELETE(
      makeRequest("/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(res.status).toBe(200);
    const row = getDb().prepare("SELECT deleted_at FROM weights WHERE id=?").get(id) as any;
    expect(row.deleted_at).toBeTruthy();
    // second delete → 404
    const r2 = await DELETE(
      makeRequest("/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r2.status).toBe(404);
  });
});
