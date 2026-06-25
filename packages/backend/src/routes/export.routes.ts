/**
 * Export routes — stream JSONL temp files as CSV / JSON / SQL on demand.
 * No full dataset buffering: all transforms use Node.js readable streams
 * piped through PassThrough transforms so Fastify can forward them directly.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import fs from 'fs';
import readline from 'readline';
import { PassThrough } from 'stream';
import { jobStore, schemaStore } from '../store/session.store.js';
import type { GeneratedRow } from '../types/index.js';

// ─── CSV line formatter ───────────────────────────────────────────────────────

// Leading chars Excel/Sheets interpret as a formula — neutralize to block
// CSV formula injection (a cell like `=cmd()` executing on open).
const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  const formula = FORMULA_LEAD_RE.test(s);
  if (formula) s = `'${s}`; // prefix apostrophe defuses the formula
  if (formula || s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvLine(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

// Quote a SQL identifier, doubling embedded double-quotes.
function sqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

/**
 * Drive a JSONL file through a per-row callback into a PassThrough with proper
 * backpressure: when the writable buffer fills, pause the line reader and
 * resume on `drain`. Keeps memory bounded regardless of dataset size.
 * Malformed lines abort the stream instead of throwing inside the emitter.
 */
function streamJsonl(
  filePath: string,
  out: PassThrough,
  onRow: (row: GeneratedRow, write: (chunk: string) => void) => void,
  onEnd?: (write: (chunk: string) => void) => void,
): void {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const write = (chunk: string) => { if (!out.write(chunk)) rl.pause(); };
  out.on('drain', () => rl.resume());

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let row: GeneratedRow;
    try {
      row = JSON.parse(line) as GeneratedRow;
    } catch (e) {
      rl.close();
      out.destroy(e as Error);
      return;
    }
    onRow(row, write);
  });
  rl.on('close', () => { onEnd?.(write); out.end(); });
  rl.on('error', err => out.destroy(err));
}

/** Stream a JSONL file as CSV rows via a PassThrough. */
function jsonlToCsvStream(filePath: string, includeHeader: boolean): PassThrough {
  const out = new PassThrough();
  if (!fs.existsSync(filePath)) { out.end(); return out; }

  let columns: string[] | null = null;
  streamJsonl(filePath, out, (row, write) => {
    if (columns === null) {
      columns = Object.keys(row);
      if (includeHeader) write(toCsvLine(columns) + '\r\n');
    }
    write(toCsvLine(columns.map(c => row[c])) + '\r\n');
  });
  return out;
}

/** Stream a JSONL file as a JSON array (`[\n...\n]`). */
function jsonlToJsonStream(filePath: string, pretty: boolean): PassThrough {
  const out = new PassThrough();
  if (!fs.existsSync(filePath)) { out.write('[]'); out.end(); return out; }

  let first = true;
  out.write('[\n');
  streamJsonl(
    filePath,
    out,
    (row, write) => {
      const sep = first ? '' : ',\n';
      first = false;
      write(sep + (pretty ? JSON.stringify(row, null, 2) : JSON.stringify(row)));
    },
    (write) => write('\n]'),
  );
  return out;
}

/** Stream a JSONL file as SQL INSERT statements (500 rows per batch). */
function jsonlToSqlStream(filePath: string, tableName: string): PassThrough {
  const out = new PassThrough();
  if (!fs.existsSync(filePath)) { out.end(); return out; }

  const safeTable = sqlIdent(tableName);
  const BATCH = 500;
  let columns: string[] | null = null;
  let batch: string[] = [];

  function sqlValue(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  function flushBatch(write: (chunk: string) => void) {
    if (batch.length === 0 || !columns) return;
    const cols = columns.map(sqlIdent).join(', ');
    write(`INSERT INTO ${safeTable} (${cols}) VALUES\n`);
    write(batch.join(',\n') + ';\n\n');
    batch = [];
  }

  streamJsonl(
    filePath,
    out,
    (row, write) => {
      if (columns === null) columns = Object.keys(row);
      batch.push(`  (${columns.map(c => sqlValue(row[c])).join(', ')})`);
      if (batch.length >= BATCH) flushBatch(write);
    },
    (write) => flushBatch(write),
  );
  return out;
}

// ─── Route helpers ────────────────────────────────────────────────────────────

function getReadyJob(jobId: string, reply: FastifyReply) {
  const job = jobStore.get(jobId);
  if (!job) { reply.code(404).send({ ok: false, error: 'Job not found' }); return null; }
  if (job.status !== 'done') { reply.code(202).send({ ok: false, error: `Job not ready: ${job.status}` }); return null; }
  return job;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function exportRoutes(app: FastifyInstance) {

  // GET /export/:jobId/csv
  app.get<{ Params: { jobId: string }; Querystring: { header?: string } }>(
    '/export/:jobId/csv',
    async (req, reply) => {
      const job = getReadyJob(req.params.jobId, reply);
      if (!job) return;
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath) return reply.code(404).send({ ok: false, error: 'Result file not found' });

      const includeHeader = req.query.header !== 'false';
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.csv"`);
      return reply.send(jsonlToCsvStream(resultPath, includeHeader));
    },
  );

  // GET /export/:jobId/json
  app.get<{ Params: { jobId: string }; Querystring: { pretty?: string } }>(
    '/export/:jobId/json',
    async (req, reply) => {
      const job = getReadyJob(req.params.jobId, reply);
      if (!job) return;
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath) return reply.code(404).send({ ok: false, error: 'Result file not found' });

      const pretty = req.query.pretty === 'true';
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.json"`);
      return reply.send(jsonlToJsonStream(resultPath, pretty));
    },
  );

  // GET /export/:jobId/sql
  app.get<{ Params: { jobId: string }; Querystring: { table?: string } }>(
    '/export/:jobId/sql',
    async (req, reply) => {
      const job = getReadyJob(req.params.jobId, reply);
      if (!job) return;
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath) return reply.code(404).send({ ok: false, error: 'Result file not found' });

      const schema = job.schemaId ? schemaStore.get(job.schemaId) : undefined;
      const tableName = req.query.table ?? schema?.name ?? 'generated_data';
      reply
        .header('Content-Type', 'text/plain')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.sql"`);
      return reply.send(jsonlToSqlStream(resultPath, tableName));
    },
  );

  // GET /export/:jobId/jsonl  (expose raw JSONL for analytics pipelines)
  app.get<{ Params: { jobId: string } }>(
    '/export/:jobId/jsonl',
    async (req, reply) => {
      const job = getReadyJob(req.params.jobId, reply);
      if (!job) return;
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath || !fs.existsSync(resultPath)) {
        return reply.code(404).send({ ok: false, error: 'Result file not found' });
      }
      reply
        .header('Content-Type', 'application/x-ndjson')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.jsonl"`);
      return reply.send(fs.createReadStream(resultPath));
    },
  );
}

// ─── Export stream helpers (used by zip-export) ───────────────────────────────

export { jsonlToCsvStream, jsonlToJsonStream, jsonlToSqlStream };
