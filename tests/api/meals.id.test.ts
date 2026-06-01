// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PATCH, DELETE } from "@/app/api/meals/[id]/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb, getDb } from "../helpers/db";

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("/api/meals/[id]", () => {
  it("PATCH updates whitelisted fields", async () => {
    seedDb({ meals: [{ calories: 500, protein_g: 25, carbs_g: 60, fat_g: 20 }] });
    const id = (getDb().prepare("SELECT id FROM meals").get() as any).id;
    const res = await PATCH(makeRequest("/x", { method: "PATCH", body: { calories: 800, items_json: "x" } }), ctx(id));
    expect(res.status).toBe(200);
    const row = getDb().prepare("SELECT calories, items_json FROM meals WHERE id=?").get(id) as any;
    expect(row.calories).toBe(800);
    expect(row.items_json).toBe("[]"); // items_json NOT in whitelist
  });

  it("DELETE soft-deletes; second call → 404", async () => {
    seedDb({ meals: [{ calories: 500, protein_g: 25, carbs_g: 60, fat_g: 20 }] });
    const id = (getDb().prepare("SELECT id FROM meals").get() as any).id;
    const r1 = await DELETE(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(r1.status).toBe(200);
    const r2 = await DELETE(makeRequest("/x", { method: "DELETE" }), ctx(id));
    expect(r2.status).toBe(404);
  });
});
