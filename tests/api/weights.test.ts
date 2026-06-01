// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/weights/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb } from "../helpers/db";

describe("GET /api/weights", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("empty: zeros and null stats", async () => {
    const json = await (await GET(makeRequest("/api/weights"))).json();
    expect(json.range_days).toBe(90);
    expect(json.rows).toEqual([]);
    expect(json.moving_avg_7d).toEqual([]);
    expect(json.stats.delta_kg).toBeNull();
    expect(json.stats.latest_kg).toBeNull();
  });

  it("days param echo, clamped to [1,365]", async () => {
    const j1 = await (await GET(makeRequest("/api/weights?days=30"))).json();
    expect(j1.range_days).toBe(30);
    const j2 = await (await GET(makeRequest("/api/weights?days=999"))).json();
    expect(j2.range_days).toBe(365);
    const j3 = await (await GET(makeRequest("/api/weights?days=0"))).json();
    expect(j3.range_days).toBe(1);
  });

  it("7-day MA collapses to simple average when all rows fit", async () => {
    const now = Date.now();
    seedDb({ weights: [
      { ts: now - 2 * 86400_000, weight_kg: 70 },
      { ts: now - 1 * 86400_000, weight_kg: 72 },
      { ts: now,                 weight_kg: 74 },
    ]});
    const json = await (await GET(makeRequest("/api/weights?days=30"))).json();
    expect(json.rows).toHaveLength(3);
    // MA at last row = (70+72+74)/3 = 72.00
    expect(json.moving_avg_7d.at(-1).weight_kg).toBe(72);
    // delta = latest - earliest = 74 - 70 = 4 (1dp)
    expect(json.stats.delta_kg).toBe(4);
    expect(json.stats.latest_kg).toBe(74);
    expect(json.stats.min_kg).toBe(70);
    expect(json.stats.max_kg).toBe(74);
  });

  it("excludes soft-deleted rows", async () => {
    const now = Date.now();
    seedDb({ weights: [
      { ts: now - 1000, weight_kg: 70, deleted_at: now },
      { ts: now,        weight_kg: 80 },
    ]});
    const json = await (await GET(makeRequest("/api/weights"))).json();
    expect(json.rows).toHaveLength(1);
    expect(json.stats.latest_kg).toBe(80);
  });
});
