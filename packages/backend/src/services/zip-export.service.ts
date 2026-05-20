/**
 * ZIP export using `archiver` — streams directly to the response without
 * buffering the full archive in memory (unlike the old JSZip approach).
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import Database from 'better-sqlite3';
import type { DatasetSchema } from '../types/index.js';
import { jsonlToCsvStream, jsonlToJsonStream, jsonlToSqlStream } from '../routes/export.routes.js';

export type ZipFormat = 'csv' | 'json' | 'sql';

function tableStream(filePath: string, tableName: string, format: ZipFormat): Readable {
  switch (format) {
    case 'json': return jsonlToJsonStream(filePath, false);
    case 'sql':  return jsonlToSqlStream(filePath, tableName);
    default:     return jsonlToCsvStream(filePath, true);
  }
}

/**
 * Build a streaming ZIP archive from per-table JSONL result files.
 * Returns an `archiver.Archiver` (a Readable stream) that Fastify can
 * send directly via `reply.send(archive)`.
 *
 * @param tables       Project table definitions (for name lookup)
 * @param resultPaths  tableId → JSONL file path
 * @param format       Output format inside the ZIP
 */
// ─── Helpers for SQLite → text formats ───────────────────────────────────────

function csvField(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sqlVal(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqliteTableToStream(db: Database.Database, tableName: string, format: ZipFormat): Readable {
  const pass = new PassThrough();
  setImmediate(() => {
    try {
      const safeTable = tableName.replace(/"/g, '""');
      const iter = db.prepare(`SELECT * FROM "${safeTable}"`).iterate() as IterableIterator<Record<string, unknown>>;
      let first = true;
      let columns: string[] = [];

      if (format === 'json') pass.write('[');

      for (const row of iter) {
        if (first) {
          columns = Object.keys(row);
          if (format === 'csv') pass.write(columns.map(csvField).join(',') + '\n');
        }
        if (format === 'csv') {
          pass.write(columns.map(c => csvField(row[c])).join(',') + '\n');
        } else if (format === 'json') {
          pass.write((first ? '' : ',\n') + JSON.stringify(row));
        } else {
          const colList = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
          const vals = columns.map(c => sqlVal(row[c])).join(', ');
          pass.write(`INSERT INTO "${safeTable}" (${colList}) VALUES (${vals});\n`);
        }
        first = false;
      }

      if (format === 'json') pass.write(']');
      pass.end();
    } catch (e) {
      pass.destroy(e as Error);
    }
  });
  return pass;
}

/**
 * Build a streaming ZIP from a saved project SQLite database.
 * Reads each table directly — no JSONL files required.
 */
export function buildZipFromDb(
  dbPath: string,
  tableNames: string[],
  format: ZipFormat = 'csv',
): archiver.Archiver {
  const db = new Database(dbPath, { readonly: true });
  const archive = archiver('zip', { zlib: { level: 6 } });

  for (const tableName of tableNames) {
    const safeName = tableName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const ext = format === 'json' ? 'json' : format === 'sql' ? 'sql' : 'csv';
    archive.append(sqliteTableToStream(db, tableName, format), { name: `${safeName}.${ext}` });
  }

  const closeDb = () => { try { db.close(); } catch { /* ignore */ } };
  archive.on('finish', closeDb);
  archive.on('error', closeDb);
  archive.finalize();
  return archive;
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildZip(
  tables: DatasetSchema[],
  resultPaths: Record<string, string>,
  format: ZipFormat = 'csv',
): archiver.Archiver {
  const tableById = new Map(tables.map(t => [t.id, t]));
  const archive = archiver('zip', { zlib: { level: 6 } });

  for (const [tableId, filePath] of Object.entries(resultPaths)) {
    const table = tableById.get(tableId);
    if (!table) continue;
    const safeName = table.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const ext = format === 'json' ? 'json' : format === 'sql' ? 'sql' : 'csv';
    archive.append(tableStream(filePath, table.name, format), { name: `${safeName}.${ext}` });
  }

  archive.finalize();
  return archive;
}
