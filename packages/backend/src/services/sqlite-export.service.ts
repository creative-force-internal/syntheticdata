/**
 * Build a SQLite .db file from per-table JSONL result files.
 * Uses better-sqlite3 (already a project dependency).
 * Rows are inserted in bulk transactions for speed; memory stays bounded
 * because rows are read from JSONL line-by-line via readline.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import readline from 'readline';
import type { ColumnDataType, DatasetSchema } from '../types/index.js';

// ─── SQLite type inference ────────────────────────────────────────────────────

function inferSqliteType(value: unknown): string {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value === 'boolean') return 'INTEGER';
  return 'TEXT';
}

function dataTypeToSqlite(dt: ColumnDataType): string {
  if (dt === 'integer') return 'INTEGER';
  if (dt === 'float') return 'REAL';
  if (dt === 'boolean') return 'INTEGER';
  return 'TEXT';
}

// ─── Schema diff + ALTER ──────────────────────────────────────────────────────

/**
 * Diff the project schema against the existing SQLite DB and apply ALTER TABLE
 * statements in-place, preserving existing rows.
 *
 * Operations performed:
 *   - New table in schema   → CREATE TABLE
 *   - Table removed         → DROP TABLE
 *   - New column in table   → ALTER TABLE … ADD COLUMN
 *   - Column removed        → ALTER TABLE … DROP COLUMN (SQLite ≥ 3.35)
 */
export function updateSqliteSchema(tables: DatasetSchema[], dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    const existingTableRows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const existingTableNames = new Set(existingTableRows.map(r => r.name));

    const newTableNames = new Set(
      tables.map(t => t.name.replace(/[^a-zA-Z0-9_]/g, '_')),
    );

    // Drop tables removed from schema
    for (const { name } of existingTableRows) {
      if (!newTableNames.has(name)) {
        db.exec(`DROP TABLE IF EXISTS "${name}"`);
      }
    }

    for (const table of tables) {
      if (table.columns.length === 0) continue;
      const tableName = table.name.replace(/[^a-zA-Z0-9_]/g, '_');

      if (!existingTableNames.has(tableName)) {
        // Brand-new table — create empty
        const colDefs = table.columns
          .map(c => `"${c.name.replace(/"/g, '""')}" ${dataTypeToSqlite(c.dataType)}`)
          .join(', ');
        db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);
      } else {
        // Table exists — diff columns
        const existingCols = db
          .prepare(`PRAGMA table_info("${tableName}")`)
          .all() as { name: string }[];
        const existingColNames = new Set(existingCols.map(c => c.name));
        const newColNames = new Set(table.columns.map(c => c.name));

        // Add new columns
        for (const col of table.columns) {
          if (!existingColNames.has(col.name)) {
            const safeName = col.name.replace(/"/g, '""');
            db.exec(
              `ALTER TABLE "${tableName}" ADD COLUMN "${safeName}" ${dataTypeToSqlite(col.dataType)}`,
            );
          }
        }

        // Drop removed columns (SQLite ≥ 3.35 — silently skip if unsupported)
        for (const col of existingCols) {
          if (!newColNames.has(col.name)) {
            try {
              db.exec(`ALTER TABLE "${tableName}" DROP COLUMN "${col.name.replace(/"/g, '""')}"`);
            } catch {
              // SQLite version too old or column has a constraint — leave it
            }
          }
        }
      }
    }
  } finally {
    db.close();
  }
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build a SQLite database file at `outPath` from per-table JSONL result files.
 * Safe to call multiple times — will overwrite the existing file.
 */
export async function buildSqliteDb(
  tables: DatasetSchema[],
  resultPaths: Record<string, string>, // tableId → JSONL path
  outPath: string,
): Promise<void> {
  // Remove existing file so we start clean
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  const db = new Database(outPath);
  db.pragma('journal_mode = WAL');

  try {
    for (const table of tables) {
      const filePath = resultPaths[table.id];
      if (!filePath || !fs.existsSync(filePath)) continue;

      // ── Peek at the first row to learn column names + types ──────────────
      let columns: string[] = [];
      let colTypes: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        rl.on('line', (line) => {
          if (!line.trim()) return;
          const firstRow = JSON.parse(line) as Record<string, unknown>;
          columns = Object.keys(firstRow);
          colTypes = columns.map(c => inferSqliteType(firstRow[c]));
          rl.close();
        });
        rl.on('close', resolve);
        rl.on('error', reject);
      });

      if (columns.length === 0) continue;

      // ── Create table ─────────────────────────────────────────────────────
      const tableName = table.name.replace(/[^a-zA-Z0-9_]/g, '_');
      const colDefs = columns.map((c, i) => `"${c.replace(/"/g, '""')}" ${colTypes[i]}`).join(', ');
      db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs})`);

      // ── Bulk insert via transaction ───────────────────────────────────────
      const placeholders = columns.map(() => '?').join(', ');
      const colNames = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
      const insert = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);

      const insertMany = db.transaction((rows: unknown[][]) => {
        for (const row of rows) insert.run(row);
      });

      const BATCH = 1000;
      let batch: unknown[][] = [];

      await new Promise<void>((resolve, reject) => {
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        rl.on('line', (line) => {
          if (!line.trim()) return;
          const row = JSON.parse(line) as Record<string, unknown>;
          batch.push(columns.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v;
          }));
          if (batch.length >= BATCH) {
            insertMany(batch);
            batch = [];
          }
        });
        rl.on('close', () => {
          if (batch.length > 0) insertMany(batch);
          resolve();
        });
        rl.on('error', reject);
      });
    }
  } finally {
    db.close();
  }
}
