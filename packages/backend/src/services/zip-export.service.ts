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

// Leading chars Excel/Sheets interpret as a formula — neutralize to block
// CSV formula injection (a cell like `=cmd()` executing on open).
const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;

function csvField(val: unknown): string {
  let s = val === null || val === undefined ? '' : String(val);
  const formula = FORMULA_LEAD_RE.test(s);
  if (formula) s = `'${s}`;
  if (formula || s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
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

const sqlIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

function sqliteTableToStream(db: Database.Database, tableName: string, format: ZipFormat): Readable {
  const pass = new PassThrough();
  const safeTable = sqlIdent(tableName);
  const iter = db.prepare(`SELECT * FROM ${safeTable}`).iterate() as IterableIterator<Record<string, unknown>>;
  let first = true;
  let columns: string[] = [];

  // Synchronous iteration would buffer the whole table in `pass`; pump with
  // backpressure instead — pause on a full buffer, resume on `drain`.
  function pump() {
    try {
      let next: IteratorResult<Record<string, unknown>>;
      while (!(next = iter.next()).done) {
        const row = next.value;
        let chunk: string;
        if (first) {
          columns = Object.keys(row);
          if (format === 'csv') chunk = columns.map(csvField).join(',') + '\n';
          else if (format === 'json') chunk = '[';
          else chunk = '';
        } else {
          chunk = '';
        }

        if (format === 'csv') {
          chunk += columns.map(c => csvField(row[c])).join(',') + '\n';
        } else if (format === 'json') {
          chunk += (first ? '' : ',\n') + JSON.stringify(row);
        } else {
          const colList = columns.map(sqlIdent).join(', ');
          const vals = columns.map(c => sqlVal(row[c])).join(', ');
          chunk += `INSERT INTO ${safeTable} (${colList}) VALUES (${vals});\n`;
        }
        first = false;

        if (!pass.write(chunk)) { pass.once('drain', pump); return; }
      }
      if (format === 'json') pass.write(first ? '[]' : ']');
      pass.end();
    } catch (e) {
      pass.destroy(e as Error);
    }
  }

  setImmediate(pump);
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
  // Without a listener an archiver 'error' is thrown as an unhandled exception
  // if it fires before Fastify attaches its own. Nothing to clean up here (no
  // DB handle, unlike buildZipFromDb); the error surfaces on the piped response.
  archive.on('error', () => { /* handled by the piped Fastify response */ });

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
