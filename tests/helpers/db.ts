// Fresh per-test better-sqlite3 instance, recreated on each beforeEach.
// Exposes seedDb() helper for fixtures.
//
// Schema is intentionally kept in lock-step with src/lib/db.ts. If you change
// the production schema, mirror it here AND add a regression test in
// tests/lib/db.test.ts to assert the divergence is intentional.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

let _db: import("better-sqlite3").Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  asset_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  display_name TEXT,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  note TEXT,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  description TEXT NOT NULL,
  meal_type TEXT,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  items_json TEXT NOT NULL,
  sources_json TEXT,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  note TEXT,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS chat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  meta_json TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): import("better-sqlite3").Database {
  if (!_db) {
    _db = new Database(":memory:");
    _db.exec(SCHEMA);
  }
  return _db;
}

export function resetDb() {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS trades;
    DROP TABLE IF EXISTS meals;
    DROP TABLE IF EXISTS weights;
    DROP TABLE IF EXISTS chat_log;
    DROP TABLE IF EXISTS settings;
  `);
  db.exec(SCHEMA);
}
// NOTE: resetDb is the ONLY place we issue DROP, and it's tied to the
// in-memory test DB only. No production-data destruction.

export type SeedTrade = Partial<{
  ts: number; asset_type: string; symbol: string; display_name: string;
  side: string; quantity: number; price: number; currency: string; note: string;
  deleted_at: number | null;
}>;
export type SeedMeal = Partial<{
  ts: number; description: string; meal_type: string; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; items_json: string;
  sources_json: string; deleted_at: number | null;
}>;
export type SeedWeight = Partial<{
  ts: number; weight_kg: number; note: string; deleted_at: number | null;
}>;

export function seedDb(input: {
  trades?: SeedTrade[];
  meals?: SeedMeal[];
  weights?: SeedWeight[];
  chat?: { ts?: number; role: string; text: string; meta_json?: string | null }[];
  settings?: Record<string, string>;
}) {
  const db = getDb();
  for (const t of input.trades || []) {
    db.prepare(
      `INSERT INTO trades (ts, asset_type, symbol, display_name, side, quantity, price, currency, note, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      t.ts ?? Date.now(),
      t.asset_type ?? "us_stock",
      t.symbol ?? "AAPL",
      t.display_name ?? t.symbol ?? "Apple",
      t.side ?? "buy",
      t.quantity ?? 1,
      t.price ?? 100,
      t.currency ?? "USD",
      t.note ?? "",
      t.deleted_at ?? null,
    );
  }
  for (const m of input.meals || []) {
    db.prepare(
      `INSERT INTO meals (ts, description, meal_type, calories, protein_g, carbs_g, fat_g, items_json, sources_json, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      m.ts ?? Date.now(),
      m.description ?? "test meal",
      m.meal_type ?? "lunch",
      m.calories ?? 500,
      m.protein_g ?? 25,
      m.carbs_g ?? 60,
      m.fat_g ?? 20,
      m.items_json ?? "[]",
      m.sources_json ?? "[]",
      m.deleted_at ?? null,
    );
  }
  for (const w of input.weights || []) {
    db.prepare(
      `INSERT INTO weights (ts, weight_kg, note, deleted_at) VALUES (?,?,?,?)`,
    ).run(w.ts ?? Date.now(), w.weight_kg ?? 75, w.note ?? "", w.deleted_at ?? null);
  }
  for (const c of input.chat || []) {
    db.prepare(`INSERT INTO chat_log (ts, role, text, meta_json) VALUES (?,?,?,?)`).run(
      c.ts ?? Date.now(),
      c.role,
      c.text,
      c.meta_json ?? null,
    );
  }
  for (const [k, v] of Object.entries(input.settings || {})) {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`).run(k, v);
  }
}
