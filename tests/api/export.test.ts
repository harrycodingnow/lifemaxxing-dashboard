// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/export/route";
import { makeRequest } from "../helpers/makeRequest";
import { seedDb } from "../helpers/db";

describe("GET /api/export", () => {
  it("400 on unknown table", async () => {
    const res = await GET(makeRequest("/api/export?table=bogus"));
    expect(res.status).toBe(400);
  });

  it("default ?table=all returns JSON with all tables", async () => {
    seedDb({ trades: [{ symbol: "AAPL", quantity: 1, price: 100, currency: "USD" }] });
    const res = await GET(makeRequest("/api/export"));
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("lifemaxx-export-");
    const body = JSON.parse(await res.text());
    expect(body.trades).toHaveLength(1);
    expect(body).toHaveProperty("meals");
    expect(body).toHaveProperty("weights");
    expect(body).toHaveProperty("settings");
  });

  it("?table=all&format=csv returns 400", async () => {
    const res = await GET(makeRequest("/api/export?format=csv"));
    expect(res.status).toBe(400);
  });

  it("CSV: header row + escaping of commas/quotes/newlines", async () => {
    seedDb({ meals: [
      { description: 'hello, "world"\nmulti-line', meal_type: "lunch", calories: 100, protein_g: 1, carbs_g: 2, fat_g: 3 },
    ]});
    const res = await GET(makeRequest("/api/export?table=meals&format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    const [header, row] = text.split("\n");
    expect(header.split(",")).toContain("description");
    // value must be quoted and inner quotes doubled
    expect(row).toContain('"hello, ""world""');
  });

  it("table=trades&format=json returns array, not wrapper", async () => {
    seedDb({ trades: [{ symbol: "AAPL", quantity: 1, price: 100, currency: "USD" }] });
    const res = await GET(makeRequest("/api/export?table=trades&format=json"));
    const body = JSON.parse(await res.text());
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].symbol).toBe("AAPL");
  });
});
