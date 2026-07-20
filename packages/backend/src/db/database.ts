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

// Per-project persistent SQLite data file. Single source of truth shared by
// the UI (save-data / query-saved / export) and the D1-compat API.
export function projectDbPath(projectId: string): string {
  return path.join(dataDir, 'project-data', `${projectId}.db`);
}

// Ensure the project-data directory exists before writing a project DB.
export function ensureProjectDataDir(): string {
  const dir = path.join(dataDir, 'project-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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

// Serves the D1 cold-path lookup (latest done job per project) without a full
// table scan + per-row JSON parse. The json_extract expression must match the
// query text exactly for SQLite to use this index.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_jobs_done_project
  ON jobs(status, json_extract(data, '$.projectId'), created_at);
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
