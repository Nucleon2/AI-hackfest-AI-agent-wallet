import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "db", "schedules.db");

let _db: Database.Database | null = null;

export interface ChatSessionRow {
  id: string;
  wallet_pubkey: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: "user" | "ai";
  text: string | null;
  component: string | null;
  receipt_json: string | null;
  history_limit: number | null;
  ts: number;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_payments (
      id                TEXT PRIMARY KEY,
      wallet_pubkey     TEXT NOT NULL,
      recipient         TEXT NOT NULL,
      amount_sol        REAL NOT NULL,
      token             TEXT NOT NULL DEFAULT 'SOL',
      frequency         TEXT NOT NULL,
      day_of_week       INTEGER,
      day_of_month      INTEGER,
      label             TEXT,
      created_at        INTEGER NOT NULL,
      next_execution_at INTEGER NOT NULL,
      last_executed_at  INTEGER,
      execution_count   INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_wallet
      ON scheduled_payments (wallet_pubkey, status, next_execution_at);

    CREATE TABLE IF NOT EXISTS contacts (
      id            TEXT PRIMARY KEY,
      wallet_pubkey TEXT NOT NULL,
      name          TEXT NOT NULL COLLATE NOCASE,
      address       TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      UNIQUE(wallet_pubkey, name)
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_wallet
      ON contacts (wallet_pubkey, name);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id            TEXT PRIMARY KEY,
      wallet_pubkey TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT 'New Chat',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_wallet
      ON chat_sessions (wallet_pubkey, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role          TEXT NOT NULL CHECK(role IN ('user','ai')),
      text          TEXT,
      component     TEXT,
      receipt_json  TEXT,
      history_limit INTEGER,
      ts            INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages (session_id, ts ASC);

    CREATE TABLE IF NOT EXISTS portfolio_configs (
      id                 TEXT PRIMARY KEY,
      wallet_pubkey      TEXT NOT NULL UNIQUE,
      targets            TEXT NOT NULL,
      drift_threshold    REAL NOT NULL DEFAULT 5.0,
      is_active          INTEGER NOT NULL DEFAULT 1,
      auto_execute       INTEGER NOT NULL DEFAULT 0,
      last_rebalanced_at INTEGER,
      created_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portfolio_wallet
      ON portfolio_configs (wallet_pubkey);

    CREATE TABLE IF NOT EXISTS dca_orders (
      id                TEXT PRIMARY KEY,
      wallet_pubkey     TEXT NOT NULL,
      input_token       TEXT NOT NULL,
      output_token      TEXT NOT NULL,
      amount_usd        REAL NOT NULL,
      interval          TEXT NOT NULL,
      day_of_week       INTEGER,
      next_run_at       INTEGER NOT NULL,
      runs_completed    INTEGER NOT NULL DEFAULT 0,
      max_runs          INTEGER,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        INTEGER NOT NULL,
      last_executed_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_dca_orders_wallet
      ON dca_orders (wallet_pubkey, is_active, next_run_at);

    CREATE TABLE IF NOT EXISTS price_alerts (
      id             TEXT PRIMARY KEY,
      wallet_pubkey  TEXT NOT NULL,
      token          TEXT NOT NULL,
      target_price   REAL NOT NULL,
      direction      TEXT NOT NULL,
      is_triggered   INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL,
      triggered_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_price_alerts_wallet
      ON price_alerts (wallet_pubkey, is_triggered);

    CREATE TABLE IF NOT EXISTS threat_log (
      id            TEXT PRIMARY KEY,
      wallet_pubkey TEXT NOT NULL,
      tx_context    TEXT NOT NULL,
      risk_level    TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_threat_log_wallet
      ON threat_log (wallet_pubkey, created_at DESC);
  `);

  // Migration: extend price_alerts with smart-alert (stop-loss / take-profit) columns
  const migrateColumns: [string, string][] = [
    ["action_type",       "TEXT NOT NULL DEFAULT 'notify'"],
    ["swap_from_token",   "TEXT"],
    ["swap_to_token",     "TEXT"],
    ["swap_amount_pct",   "REAL"],
    ["swap_amount_fixed", "REAL"],
    ["label",             "TEXT"],
  ];
  for (const [col, def] of migrateColumns) {
    try { _db.exec(`ALTER TABLE price_alerts ADD COLUMN ${col} ${def}`); }
    catch { /* column already exists — safe to ignore */ }
  }

  return _db;
}

export interface PortfolioConfigRow {
  id: string;
  wallet_pubkey: string;
  targets: string;
  drift_threshold: number;
  is_active: number;
  auto_execute: number;
  last_rebalanced_at: number | null;
  created_at: number;
}
