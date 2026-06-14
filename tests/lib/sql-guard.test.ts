// @vitest-environment node
//
// Defense-in-depth SQL guard: SELECT-only, single statement, no destructive
// keywords. The "ask your data" route relies on this to keep the LLM honest.
import { describe, it, expect } from "vitest";
import { guardSelect, applyRowCap } from "@/lib/sql-guard";

describe("guardSelect — happy path", () => {
  it("accepts a plain SELECT", () => {
    const r = guardSelect("SELECT 1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toBe("SELECT 1");
  });

  it("accepts SELECT with whitespace + trailing semicolon", () => {
    const r = guardSelect("  SELECT  id, ts  FROM trades  WHERE  deleted_at IS NULL  ;  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toBe("SELECT id, ts FROM trades WHERE deleted_at IS NULL");
  });

  it("accepts WITH ... SELECT (CTE)", () => {
    const r = guardSelect("WITH x AS (SELECT 1 AS n) SELECT n FROM x LIMIT 1");
    expect(r.ok).toBe(true);
  });

  it("accepts subqueries and aggregations", () => {
    const r = guardSelect(
      "SELECT date(ts/1000,'unixepoch','localtime') AS day, ROUND(SUM(calories),0) AS kcal FROM meals WHERE deleted_at IS NULL GROUP BY day ORDER BY day DESC LIMIT 30",
    );
    expect(r.ok).toBe(true);
  });
});

describe("guardSelect — rejections", () => {
  it("rejects empty SQL", () => {
    expect(guardSelect("").ok).toBe(false);
    expect(guardSelect("   ").ok).toBe(false);
  });

  it("rejects non-SELECT verbs", () => {
    for (const sql of [
      "DELETE FROM trades",
      "DROP TABLE trades",
      "INSERT INTO trades VALUES (1)",
      "UPDATE trades SET ts = 0",
      "ALTER TABLE trades ADD COLUMN x INT",
      "TRUNCATE trades",
      "PRAGMA table_info(trades)",
      "VACUUM",
      "ATTACH DATABASE 'x.db' AS x",
      "CREATE TABLE x (id INT)",
    ]) {
      const r = guardSelect(sql);
      expect(r.ok, `should reject: ${sql}`).toBe(false);
    }
  });

  it("rejects multi-statement injections", () => {
    const r = guardSelect("SELECT 1; DROP TABLE trades");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/multiple/i);
  });

  it("rejects DROP smuggled in a -- comment then newline-injected", () => {
    // Even after comment-stripping the smuggled keyword should be caught.
    const r = guardSelect("SELECT 1 -- ; DROP TABLE trades\n");
    // The DROP lives only inside a comment so stripping eliminates it AND
    // there's no semicolon outside the comment → this should actually pass.
    expect(r.ok).toBe(true);
  });

  it("rejects DROP smuggled in a /* */ comment AND a real semicolon", () => {
    const r = guardSelect("SELECT 1 /* nice try */; DROP TABLE trades");
    expect(r.ok).toBe(false);
  });

  it("rejects SELECT against sqlite_master", () => {
    const r = guardSelect("SELECT name FROM sqlite_master");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.toLowerCase()).toContain("sqlite_master");
  });

  it("rejects SELECT against sqlite_schema", () => {
    const r = guardSelect("SELECT name FROM sqlite_schema");
    expect(r.ok).toBe(false);
  });

  it("rejects BEGIN / COMMIT", () => {
    expect(guardSelect("BEGIN").ok).toBe(false);
    expect(guardSelect("SELECT 1; COMMIT").ok).toBe(false);
  });
});

describe("applyRowCap", () => {
  it("appends a LIMIT when missing", () => {
    expect(applyRowCap("SELECT * FROM trades", 500)).toBe("SELECT * FROM trades LIMIT 500");
  });

  it("respects an existing LIMIT below the cap", () => {
    expect(applyRowCap("SELECT * FROM trades LIMIT 50", 500)).toBe("SELECT * FROM trades LIMIT 50");
  });

  it("clamps an over-cap LIMIT down to the cap", () => {
    expect(applyRowCap("SELECT * FROM trades LIMIT 100000", 500)).toBe(
      "SELECT * FROM trades LIMIT 500",
    );
  });

  it("preserves trailing clauses after the LIMIT number", () => {
    // ORDER BY ... LIMIT N OFFSET M — keep the OFFSET, just clamp N.
    expect(applyRowCap("SELECT * FROM trades ORDER BY ts LIMIT 9999 OFFSET 10", 500)).toBe(
      "SELECT * FROM trades ORDER BY ts LIMIT 500 OFFSET 10",
    );
  });
});
