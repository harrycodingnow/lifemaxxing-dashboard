import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "lifemaxx.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  asset_type TEXT NOT NULL,            -- 'tw_stock' | 'us_stock' | 'crypto'
  symbol TEXT NOT NULL,                -- e.g. '2330.TW', 'AAPL', 'BTC'
  display_name TEXT,
  side TEXT NOT NULL,                  -- 'buy' | 'sell'
  quantity REAL NOT NULL,
  price REAL NOT NULL,                 -- price per unit in native currency
  currency TEXT NOT NULL,              -- 'TWD' | 'USD'
  note TEXT
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  description TEXT NOT NULL,           -- raw user text for this meal
  meal_type TEXT,                      -- breakfast|lunch|dinner|snack
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  items_json TEXT NOT NULL,            -- JSON array of food items w/ per-item macros
  sources_json TEXT                    -- JSON array of source URLs/citations
);

CREATE TABLE IF NOT EXISTS weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS chat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL,                  -- 'user' | 'assistant'
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
  due_ts INTEGER,                      -- nullable; epoch ms
  priority INTEGER NOT NULL DEFAULT 0, -- 0 none, 1 low, 2 med, 3 high
  done INTEGER NOT NULL DEFAULT 0,     -- 0 open, 1 completed
  done_ts INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_todos_open ON todos(done, deleted_at, due_ts);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL DEFAULT 'idea',  -- idea|planning|building|shipping|maintaining|paused|done
  status TEXT NOT NULL DEFAULT 'on_track', -- on_track|at_risk|blocked|done
  current_problem TEXT,                -- what's blocking / open question right now
  next_step TEXT,                      -- next concrete action
  priority INTEGER NOT NULL DEFAULT 2, -- 1 low, 2 med, 3 high
  url TEXT,                            -- repo / docs link
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER                  -- soft-archive (no hard delete per SOUL)
);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(archived_at, phase, priority);
`);

// Idempotent migration: add deleted_at to trades/meals/weights if missing.
// SQLite has no IF NOT EXISTS for ADD COLUMN, so we introspect pragma.
function ensureColumn(table: string, column: string, decl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
ensureColumn("trades", "deleted_at", "INTEGER");
ensureColumn("meals", "deleted_at", "INTEGER");
ensureColumn("weights", "deleted_at", "INTEGER");

export default db;
