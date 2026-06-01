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
`);

export default db;
