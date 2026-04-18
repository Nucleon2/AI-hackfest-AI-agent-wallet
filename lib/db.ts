import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "db", "schedules.db");

let _db: Database.Database | null = null;

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
  `);
  return _db;
}
