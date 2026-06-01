// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/nutrition/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb } from "../helpers/db";

describe("GET /api/nutrition", () => {
  beforeEach(() => {
    // freeze noon local 2026-06-01
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("returns default goals + zero totals when no meals", async () => {
    const json = await (await GET(makeRequest("/api/nutrition"))).json();
    expect(json.totals).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(json.goals.calories).toBeGreaterThan(0);
  });

  it("totals match sum of today's meals only", async () => {
    const now = Date.now();
    const yesterday = now - 25 * 3600_000;
    seedDb({ meals: [
      { ts: yesterday, calories: 999, protein_g: 99, carbs_g: 99, fat_g: 99 }, // excluded
      { ts: now - 3600_000, calories: 500, protein_g: 30, carbs_g: 50, fat_g: 10 },
      { ts: now - 1800_000, calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5 },
    ]});
    const json = await (await GET(makeRequest("/api/nutrition"))).json();
    expect(json.totals.calories).toBe(700);
    expect(json.totals.protein_g).toBe(50);
    expect(json.meals).toHaveLength(2);
  });

  it("soft-deleted meals are excluded", async () => {
    const now = Date.now();
    seedDb({ meals: [
      { ts: now - 1000, calories: 500, protein_g: 30, carbs_g: 50, fat_g: 10, deleted_at: now },
    ]});
    const json = await (await GET(makeRequest("/api/nutrition"))).json();
    expect(json.totals.calories).toBe(0);
  });

  it("reads custom goals from settings", async () => {
    seedDb({ settings: { "goal.calories": "3000", "goal.protein_g": "200" } });
    const json = await (await GET(makeRequest("/api/nutrition"))).json();
    expect(json.goals.calories).toBe(3000);
    expect(json.goals.protein_g).toBe(200);
  });
});
