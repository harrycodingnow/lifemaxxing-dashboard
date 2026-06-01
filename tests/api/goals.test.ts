// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET, POST } from "@/app/api/goals/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb, getDb } from "../helpers/db";

describe("/api/goals", () => {
  it("GET returns defaults when no settings rows", async () => {
    const json = await (await GET()).json();
    expect(json.goals.calories).toBeGreaterThan(0);
    expect(json.defaults).toEqual(json.goals);
  });

  it("POST persists positive numeric fields", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: { goals: { calories: 2500, protein_g: 180 } } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.goals.calories).toBe(2500);
    expect(json.goals.protein_g).toBe(180);
    const v = getDb().prepare("SELECT value FROM settings WHERE key='goal.calories'").get() as any;
    expect(v.value).toBe("2500");
  });

  it("POST accepts top-level shape (no goals wrapper)", async () => {
    const res = await POST(makeRequest("/x", { method: "POST", body: { calories: 1900 } }));
    const json = await res.json();
    expect(json.goals.calories).toBe(1900);
  });

  it("POST rejects non-positive / non-numeric, leaving prior value intact", async () => {
    seedDb({ settings: { "goal.calories": "2400" } });
    const res = await POST(makeRequest("/x", { method: "POST", body: { goals: { calories: -10, protein_g: "abc" } } }));
    const json = await res.json();
    expect(json.goals.calories).toBe(2400); // unchanged
  });

  it("POST leaves unspecified fields untouched", async () => {
    seedDb({ settings: { "goal.protein_g": "200" } });
    const res = await POST(makeRequest("/x", { method: "POST", body: { goals: { calories: 1800 } } }));
    const json = await res.json();
    expect(json.goals.calories).toBe(1800);
    expect(json.goals.protein_g).toBe(200);
  });
});
