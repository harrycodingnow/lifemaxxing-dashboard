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

-- Recurring subscriptions (Netflix, Spotify, etc.) with cancel/charge reminders.
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,                -- price per cycle in native currency
  currency TEXT NOT NULL DEFAULT 'TWD',-- 'TWD' | 'USD'
  cycle TEXT NOT NULL DEFAULT 'monthly', -- 'weekly' | 'monthly' | 'yearly'
  next_charge_ts INTEGER,              -- nullable; epoch ms of next billing date
  url TEXT,                            -- manage/cancel link
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER                  -- soft-cancel (no hard delete per SOUL)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(archived_at, next_charge_ts);

-- Habits + per-day log. One log row per (habit, day); status done|skip.
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER                  -- soft-archive (no hard delete per SOUL)
);
CREATE INDEX IF NOT EXISTS idx_habits_active ON habits(archived_at, sort_order);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL,
  day TEXT NOT NULL,                   -- 'YYYY-MM-DD' local day
  status TEXT NOT NULL DEFAULT 'done', -- 'done' | 'skip'
  ts INTEGER NOT NULL,                 -- when logged (epoch ms)
  UNIQUE(habit_id, day)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id, day);

-- Net worth: manual cash accounts (assets) + liabilities (debts).
CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,     -- balance in native currency (assets, positive)
  currency TEXT NOT NULL DEFAULT 'TWD',-- 'TWD' | 'USD'
  kind TEXT NOT NULL DEFAULT 'cash',   -- 'cash' | 'bank' | 'brokerage_cash' | 'other'
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cash_active ON cash_accounts(archived_at, sort_order);

CREATE TABLE IF NOT EXISTS liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,     -- amount owed in native currency (positive number)
  currency TEXT NOT NULL DEFAULT 'TWD',-- 'TWD' | 'USD'
  kind TEXT NOT NULL DEFAULT 'loan',   -- 'loan' | 'credit_card' | 'mortgage' | 'other'
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_liabilities_active ON liabilities(archived_at, sort_order);

-- User-generated widgets: natural-language prompt → Hermes-authored self-contained
-- HTML, rendered in a sandboxed iframe. html is a full <!doctype html> document.
CREATE TABLE IF NOT EXISTS custom_widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,            -- the user's natural-language request
  html TEXT NOT NULL,              -- self-contained HTML document (sandboxed on render)
  w INTEGER NOT NULL DEFAULT 4,    -- default grid size
  h INTEGER NOT NULL DEFAULT 6,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_custom_widgets_active ON custom_widgets(archived_at, created_ts);

-- Read-later inbox: URLs (YouTube, articles, blog posts, anything) the user
-- wants to come back to. Auto-populated when a chat message is a bare URL.
-- Metadata is best-effort: YouTube via oEmbed, everything else via the page's
-- og:title / og:image / og:description meta tags fetched server-side.
CREATE TABLE IF NOT EXISTS saved_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  added_at INTEGER NOT NULL,
  url TEXT NOT NULL UNIQUE,         -- canonical URL we stored against
  kind TEXT NOT NULL,               -- 'youtube' | 'article' | 'twitter' | 'other'
  title TEXT,                       -- page <title> or og:title
  description TEXT,                 -- og:description (first 500 chars)
  author TEXT,                      -- YouTube channel name / article byline
  site_name TEXT,                   -- og:site_name or hostname
  thumbnail_url TEXT,               -- og:image or YouTube thumbnail
  duration_seconds INTEGER,         -- YouTube videos only
  status TEXT NOT NULL DEFAULT 'unread',  -- 'unread' | 'reading' | 'done'
  note TEXT,                        -- optional user note (anything after the URL in the chat message)
  opened_at INTEGER,                -- when the user clicked through
  archived_at INTEGER,              -- soft-delete (matches the rest of the schema)
  raw_meta_json TEXT                -- full fetched metadata blob for forensics
);
CREATE INDEX IF NOT EXISTS idx_saved_links_active ON saved_links(archived_at, status, added_at DESC);
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
