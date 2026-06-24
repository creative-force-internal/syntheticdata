/**
 * SQLite database setup via better-sqlite3.
 * WAL mode for concurrent reads during long-running generation jobs.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── Open DB ──────────────────────────────────────────────────────────────────

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'synthetic.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const dataDir = dbDir;

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS schemas (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    progress    INTEGER NOT NULL DEFAULT 0,
    result_path TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS project_api_keys (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    key_prefix   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_project ON project_api_keys(project_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON project_api_keys(key_hash);
`);

// Idempotent ALTER: add projects.group_id column on first run only.
// SQLite has no "ADD COLUMN IF NOT EXISTS"; introspect via PRAGMA.
{
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'group_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN group_id TEXT`);
  }
}

// ─── WAL checkpoint helper ────────────────────────────────────────────────────

let _progressUpdateCount = 0;

export function maybeCheckpoint(): void {
  if (++_progressUpdateCount % 1000 === 0) {
    db.pragma('wal_checkpoint(PASSIVE)');
  }
}
