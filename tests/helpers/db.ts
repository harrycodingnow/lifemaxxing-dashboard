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
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_ts INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  done_ts INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL DEFAULT 'idea',
  status TEXT NOT NULL DEFAULT 'on_track',
  current_problem TEXT,
  next_step TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  cycle TEXT NOT NULL DEFAULT 'monthly',
  next_charge_ts INTEGER,
  url TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  ts INTEGER NOT NULL,
  UNIQUE(habit_id, day)
);
CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  kind TEXT NOT NULL DEFAULT 'cash',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  kind TEXT NOT NULL DEFAULT 'loan',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS custom_widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  html TEXT NOT NULL,
  w INTEGER NOT NULL DEFAULT 4,
  h INTEGER NOT NULL DEFAULT 6,
  archived_at INTEGER
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
    DROP TABLE IF EXISTS todos;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS habit_logs;
    DROP TABLE IF EXISTS cash_accounts;
    DROP TABLE IF EXISTS liabilities;
    DROP TABLE IF EXISTS custom_widgets;
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
export type SeedTodo = Partial<{
  created_ts: number; updated_ts: number; title: string; notes: string;
  due_ts: number | null; priority: number; done: number; done_ts: number | null;
  sort_order: number; deleted_at: number | null;
}>;
export type SeedSubscription = Partial<{
  created_ts: number; updated_ts: number; name: string; amount: number;
  currency: string; cycle: string; next_charge_ts: number | null; url: string;
  notes: string; sort_order: number; archived_at: number | null;
}>;
export type SeedHabit = Partial<{
  created_ts: number; updated_ts: number; name: string; emoji: string;
  sort_order: number; archived_at: number | null;
}>;
export type SeedHabitLog = Partial<{
  habit_id: number; day: string; status: string; ts: number;
}>;
export type SeedCash = Partial<{
  created_ts: number; updated_ts: number; name: string; balance: number;
  currency: string; kind: string; sort_order: number; archived_at: number | null;
}>;
export type SeedLiability = Partial<{
  created_ts: number; updated_ts: number; name: string; balance: number;
  currency: string; kind: string; sort_order: number; archived_at: number | null;
}>;

export function seedDb(input: {
  trades?: SeedTrade[];
  meals?: SeedMeal[];
  weights?: SeedWeight[];
  chat?: { ts?: number; role: string; text: string; meta_json?: string | null }[];
  settings?: Record<string, string>;
  todos?: SeedTodo[];
  subscriptions?: SeedSubscription[];
  habits?: SeedHabit[];
  habit_logs?: SeedHabitLog[];
  cash_accounts?: SeedCash[];
  liabilities?: SeedLiability[];
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
  for (const t of input.todos || []) {
    const now = t.created_ts ?? Date.now();
    db.prepare(
      `INSERT INTO todos (created_ts, updated_ts, title, notes, due_ts, priority, done, done_ts, sort_order, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      now,
      t.updated_ts ?? now,
      t.title ?? "task",
      t.notes ?? null,
      t.due_ts ?? null,
      t.priority ?? 0,
      t.done ?? 0,
      t.done_ts ?? null,
      t.sort_order ?? now,
      t.deleted_at ?? null,
    );
  }
  for (const s of input.subscriptions || []) {
    const now = s.created_ts ?? Date.now();
    db.prepare(
      `INSERT INTO subscriptions (created_ts, updated_ts, name, amount, currency, cycle, next_charge_ts, url, notes, sort_order, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      now,
      s.updated_ts ?? now,
      s.name ?? "Netflix",
      s.amount ?? 390,
      s.currency ?? "TWD",
      s.cycle ?? "monthly",
      s.next_charge_ts ?? null,
      s.url ?? null,
      s.notes ?? null,
      s.sort_order ?? 0,
      s.archived_at ?? null,
    );
  }
  for (const h of input.habits || []) {
    const now = h.created_ts ?? Date.now();
    db.prepare(
      `INSERT INTO habits (created_ts, updated_ts, name, emoji, sort_order, archived_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(now, h.updated_ts ?? now, h.name ?? "meditate", h.emoji ?? null, h.sort_order ?? 0, h.archived_at ?? null);
  }
  for (const l of input.habit_logs || []) {
    db.prepare(
      `INSERT OR REPLACE INTO habit_logs (habit_id, day, status, ts) VALUES (?,?,?,?)`,
    ).run(l.habit_id ?? 1, l.day ?? "2026-06-01", l.status ?? "done", l.ts ?? Date.now());
  }
  for (const c of input.cash_accounts || []) {
    const now = c.created_ts ?? Date.now();
    db.prepare(
      `INSERT INTO cash_accounts (created_ts, updated_ts, name, balance, currency, kind, sort_order, archived_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(now, c.updated_ts ?? now, c.name ?? "Cathay", c.balance ?? 0, c.currency ?? "TWD", c.kind ?? "cash", c.sort_order ?? 0, c.archived_at ?? null);
  }
  for (const li of input.liabilities || []) {
    const now = li.created_ts ?? Date.now();
    db.prepare(
      `INSERT INTO liabilities (created_ts, updated_ts, name, balance, currency, kind, sort_order, archived_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(now, li.updated_ts ?? now, li.name ?? "Student loan", li.balance ?? 0, li.currency ?? "TWD", li.kind ?? "loan", li.sort_order ?? 0, li.archived_at ?? null);
  }
}
