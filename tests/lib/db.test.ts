// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getDb, seedDb, resetDb } from "../helpers/db";

describe("db schema (mirrors src/lib/db.ts)", () => {
  it("creates trades, meals, weights, chat_log, settings", () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const n of ["trades", "meals", "weights", "chat_log", "settings"]) {
      expect(names).toContain(n);
    }
  });

  it("trades table has the documented columns", () => {
    const cols = getDb().prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>;
    const expected = [
      "id", "ts", "asset_type", "symbol", "display_name", "side",
      "quantity", "price", "currency", "note", "deleted_at",
    ];
    for (const c of expected) expect(cols.map((x) => x.name)).toContain(c);
  });

  it("meals table has the documented columns including items_json", () => {
    const cols = getDb().prepare("PRAGMA table_info(meals)").all() as Array<{ name: string }>;
    const names = cols.map((x) => x.name);
    for (const c of ["calories", "protein_g", "carbs_g", "fat_g", "items_json", "sources_json", "deleted_at"]) {
      expect(names).toContain(c);
    }
  });

  it("seedDb round-trips a trade", () => {
    seedDb({ trades: [{ symbol: "TEST", quantity: 5, price: 10 }] });
    const row = getDb().prepare("SELECT * FROM trades WHERE symbol='TEST'").get() as any;
    expect(row.quantity).toBe(5);
    expect(row.price).toBe(10);
  });

  // NOTE: src/lib/db.ts at b01c133 has the previously-documented duplicate
  // CREATE TABLE weights removed. Running the DDL twice must still be safe
  // because of IF NOT EXISTS.
  it("running the production DDL a second time is idempotent (IF NOT EXISTS)", () => {
    const db = getDb();
    expect(() =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS weights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          weight_kg REAL NOT NULL,
          note TEXT,
          deleted_at INTEGER
        );
      `),
    ).not.toThrow();
  });

  it("ensureColumn-style migration is idempotent (running ADD COLUMN check twice does nothing)", () => {
    const db = getDb();
    // already-present column: deleted_at on trades
    const cols = db.prepare(`PRAGMA table_info(trades)`).all() as Array<{ name: string }>;
    const hasDeleted = cols.find((c) => c.name === "deleted_at");
    expect(hasDeleted).toBeTruthy();
    // simulate the production ensureColumn logic on a column that already exists
    function ensureColumn(table: string, column: string, decl: string) {
      const c = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!c.find((x) => x.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
    expect(() => {
      ensureColumn("trades", "deleted_at", "INTEGER");
      ensureColumn("trades", "deleted_at", "INTEGER");
    }).not.toThrow();
  });

  it("resetDb wipes all rows (without DROPping production data — uses :memory:)", () => {
    seedDb({ trades: [{ symbol: "WIPE" }] });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM trades").get()).toEqual({ n: 1 });
    resetDb();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM trades").get()).toEqual({ n: 0 });
  });
});
