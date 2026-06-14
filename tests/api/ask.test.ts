// @vitest-environment node
//
// /api/ask — natural-language → safe SELECT → result.
// Hermes is mocked so we can drive the model's "response" deterministically.
// The SQL guard + SQLite execution path is exercised end-to-end against the
// in-memory test DB.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/ask/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { resetDb, getDb, seedDb } from "../helpers/db";
import { setHermesResponder, resetHermesResponder } from "../helpers/hermes";

beforeEach(() => resetDb());
afterEach(() => resetHermesResponder());

function fence(obj: unknown): string {
  // Hermes returns json — extractJson tries fenced first, then last bare blob.
  return JSON.stringify(obj);
}

describe("POST /api/ask", () => {
  it("400 when question is missing", async () => {
    const res = await POST(makeRequest("/api/ask", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/question required/);
  });

  it("400 when body is not JSON", async () => {
    const res = await POST(makeRequest("/api/ask", { method: "POST", body: "not json", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });

  it("returns a narrative answer when Hermes says it can't answer", async () => {
    setHermesResponder(() => fence({ kind: "narrative", narrative: "Out of scope." }));
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "meaning of life?" } }),
    );
    expect(res.status).toBe(200);
    const j = await jsonOf(res);
    expect(j.kind).toBe("answer");
    expect(j.display).toBe("narrative");
    expect(j.answer).toBe("Out of scope.");
  });

  it("executes a scalar SELECT and shapes a scalar answer", async () => {
    // Seed one trade so SUM works.
    seedDb({
      trades: [
        { ts: Date.now() - 86400_000, asset_type: "us_stock", symbol: "AAPL", side: "buy", quantity: 1, price: 200, currency: "USD" },
        { ts: Date.now() - 2 * 86400_000, asset_type: "us_stock", symbol: "AAPL", side: "buy", quantity: 2, price: 195, currency: "USD" },
      ],
    });
    setHermesResponder(() =>
      fence({
        kind: "sql",
        sql: "SELECT ROUND(SUM(quantity*price),2) AS total_usd FROM trades WHERE deleted_at IS NULL AND symbol = ? AND side = 'buy' LIMIT 1",
        params: ["AAPL"],
        explanation: "Total USD spent buying AAPL.",
        display: "scalar",
      }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "how much have I spent on AAPL?" } }),
    );
    expect(res.status).toBe(200);
    const j = await jsonOf(res);
    expect(j.kind).toBe("answer");
    expect(j.display).toBe("scalar");
    expect(j.columns).toEqual(["total_usd"]);
    expect(j.rows).toEqual([[590]]); // 1*200 + 2*195
    expect(j.answer).toMatch(/total_usd = 590/);
    expect(j.explanation).toBe("Total USD spent buying AAPL.");
  });

  it("executes a multi-row SELECT and returns columns + rows", async () => {
    const now = Date.now();
    seedDb({
      trades: [
        { ts: now - 1, asset_type: "crypto", symbol: "BTC", side: "buy", quantity: 0.1, price: 90000, currency: "USD" },
        { ts: now - 2, asset_type: "crypto", symbol: "BTC", side: "sell", quantity: 0.05, price: 95000, currency: "USD" },
        { ts: now - 3, asset_type: "us_stock", symbol: "NVDA", side: "buy", quantity: 5, price: 800, currency: "USD" },
      ],
    });
    setHermesResponder(() =>
      fence({
        kind: "sql",
        sql: "SELECT symbol, side, quantity, price FROM trades WHERE deleted_at IS NULL AND symbol = ? ORDER BY ts DESC LIMIT 100",
        params: ["BTC"],
        explanation: "All BTC trades.",
        display: "table",
      }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "all my BTC trades" } }),
    );
    const j = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(j.columns).toEqual(["symbol", "side", "quantity", "price"]);
    expect(j.rows).toHaveLength(2);
    expect(j.rows[0][0]).toBe("BTC");
    expect(j.row_count).toBe(2);
  });

  it("rejects a SELECT that would touch sqlite_master", async () => {
    setHermesResponder(() =>
      fence({ kind: "sql", sql: "SELECT name FROM sqlite_master LIMIT 5", params: [] }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "list tables" } }),
    );
    expect(res.status).toBe(400);
    const j = await jsonOf(res);
    expect(j.error).toMatch(/unsafe SQL rejected/i);
    expect(j.error.toLowerCase()).toContain("sqlite_master");
  });

  it("rejects a multi-statement injection from Hermes", async () => {
    setHermesResponder(() =>
      fence({ kind: "sql", sql: "SELECT 1; DROP TABLE trades", params: [] }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "trick query" } }),
    );
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/multiple/i);
  });

  it("returns 502 when Hermes output is unparseable", async () => {
    setHermesResponder(() => "not json at all, no braces");
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "huh" } }),
    );
    expect(res.status).toBe(502);
    expect((await jsonOf(res)).error).toMatch(/ask parse failed/i);
  });

  it("clamps a too-large LIMIT (defense in depth)", async () => {
    // Seed enough rows to confirm capping in principle — we just check that
    // the executed SQL string came back capped.
    seedDb({
      trades: Array.from({ length: 3 }, (_, i) => ({
        ts: Date.now() - i, asset_type: "us_stock", symbol: "X", side: "buy",
        quantity: 1, price: 1, currency: "USD",
      })),
    });
    setHermesResponder(() =>
      fence({
        kind: "sql",
        sql: "SELECT id FROM trades WHERE deleted_at IS NULL LIMIT 100000",
        params: [],
      }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "all rows" } }),
    );
    const j = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(j.sql).toMatch(/LIMIT 500/);
  });

  it("zero-row result shapes a friendly 'no rows matched' answer", async () => {
    setHermesResponder(() =>
      fence({
        kind: "sql",
        sql: "SELECT id FROM trades WHERE deleted_at IS NULL AND symbol = ? LIMIT 50",
        params: ["NOTREAL"],
        explanation: "Trades for the nonexistent symbol.",
        display: "table",
      }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "any trades for FOO?" } }),
    );
    const j = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(j.row_count).toBe(0);
    expect(j.answer).toMatch(/no rows matched/i);
  });

  it("surfaces SQLite execution errors as 400 with the broken SQL", async () => {
    setHermesResponder(() =>
      fence({
        kind: "sql",
        sql: "SELECT no_such_column FROM trades LIMIT 1",
        params: [],
      }),
    );
    const res = await POST(
      makeRequest("/api/ask", { method: "POST", body: { question: "bad col" } }),
    );
    expect(res.status).toBe(400);
    const j = await jsonOf(res);
    expect(j.error).toMatch(/SQL execution failed/i);
    expect(j.sql).toMatch(/no_such_column/);
  });
});
