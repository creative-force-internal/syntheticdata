/**
 * SQLite database setup via better-sqlite3.
 * WAL mode for concurrent reads during long-running generation jobs.
 * Startup tasks: expire stale jobs, purge jobs older than 7 days.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { isInsideTempDir } from '../services/tempfile.service.js';

/**
 * Only unlink files that resolve inside the controlled temp dir. Defense in
 * depth against any attacker-supplied path that may have been persisted into
 * a job's `resultPaths` map before input validation was tightened.
 */
function safeUnlink(p: string | null | undefined): void {
  if (!p) return;
  if (!isInsideTempDir(p)) return;
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

// ─── Open DB ──────────────────────────────────────────────────────────────────

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'synthetic.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

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

// Idempotent ALTER: add projects.group_id column on first run only.
// SQLite has no "ADD COLUMN IF NOT EXISTS"; introspect via PRAGMA.
{
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'group_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN group_id TEXT`);
  }
}

// ─── Startup: expire done jobs whose result files are missing ─────────────────

type JobRow = { id: string; data: string; result_path: string | null };

const doneJobs = db
  .prepare(`SELECT id, data, result_path FROM jobs WHERE status = 'done'`)
  .all() as JobRow[];

for (const row of doneJobs) {
  const data = JSON.parse(row.data) as Record<string, unknown>;

  // Single-table job: check result_path column
  if (row.result_path && !fs.existsSync(row.result_path)) {
    data.status = 'expired';
    db.prepare(`UPDATE jobs SET status = 'expired', data = ? WHERE id = ?`)
      .run(JSON.stringify(data), row.id);
    continue;
  }

  // Project job: check all per-table paths in the JSON blob
  const resultPaths = data.resultPaths as Record<string, string> | undefined;
  if (resultPaths) {
    const allExist = Object.values(resultPaths).every(p => fs.existsSync(p));
    if (!allExist) {
      data.status = 'expired';
      db.prepare(`UPDATE jobs SET status = 'expired', data = ? WHERE id = ?`)
        .run(JSON.stringify(data), row.id);
    }
  }
}

// ─── Startup: delete jobs older than 7 days ───────────────────────────────────

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const oldJobs = db
  .prepare(`SELECT id, result_path, data FROM jobs WHERE created_at < ?`)
  .all(cutoff) as JobRow[];

for (const row of oldJobs) {
  // Delete single-table result file
  safeUnlink(row.result_path);
  // Delete project result files
  try {
    const data = JSON.parse(row.data) as Record<string, unknown>;
    const resultPaths = data.resultPaths as Record<string, string> | undefined;
    if (resultPaths) {
      for (const p of Object.values(resultPaths)) safeUnlink(p);
    }
  } catch { /* ignore */ }
}

if (oldJobs.length > 0) {
  db.prepare(`DELETE FROM jobs WHERE created_at < ?`).run(cutoff);
}

// ─── WAL checkpoint helper ────────────────────────────────────────────────────

let _progressUpdateCount = 0;

export function maybeCheckpoint(): void {
  if (++_progressUpdateCount % 1000 === 0) {
    db.pragma('wal_checkpoint(PASSIVE)');
  }
}
