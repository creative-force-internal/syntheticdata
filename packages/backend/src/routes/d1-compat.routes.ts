/**
 * D1-compatible HTTP API for synthetic project data.
 *
 * Wire protocol mirrors Cloudflare D1's REST API so users can use the
 * standard D1 `Database` class pointed at this server:
 *
 *   const db = new Database({
 *     fetch: (path, init) =>
 *       fetch(`http://localhost:3001/db/${projectId}${path}`, {
 *         ...init,
 *         headers: { ...init?.headers, Authorization: `Bearer ${apiKey}` },
 *       }),
 *   });
 *
 * D1-compat endpoints (auth required):
 *   POST /db/:projectId/query    — SELECT / batch queries → D1Success | D1Success[]
 *   POST /db/:projectId/execute  — DML writes            → D1Success (changes/lastRowId)
 *   POST /db/:projectId/dump     — SQLite binary stream   → ArrayBuffer
 *
 * API key management (standard ApiResponse wrapper):
 *   GET    /api/v1/projects/:projectId/api-keys
 *   POST   /api/v1/projects/:projectId/api-keys
 *   DELETE /api/v1/projects/:projectId/api-keys/:keyId
 */

import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db as mainDb, projectDbPath, ensureProjectDataDir } from '../db/database.js';
import { projectStore } from '../store/session.store.js';
import { buildSqliteDb } from '../services/sqlite-export.service.js';
import { getProjectDb, closeProjectDb, checkpointProjectDb } from '../services/project-db.service.js';
import type { GenerationJob, ProjectApiKey } from '../types/index.js';

// ─── Security ─────────────────────────────────────────────────────────────────

// ATTACH/DETACH open arbitrary host files — block unconditionally.
const BLOCKED_SQL_RE = /\b(attach|detach)\b/i;

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Leading keyword marks a statement that writes or defines schema. Used to
// decide whether an absent project DB should be provisioned instead of 404'd.
const WRITE_SQL_RE = /^\s*(?:create|alter|drop|insert|update|delete|replace|pragma|with\b[\s\S]*?\b(?:insert|update|delete)\b)/i;

function hasWrite(stmts: ParsedStmt[]): boolean {
  return stmts.some(s => WRITE_SQL_RE.test(s.sql));
}

// ─── API key helpers ──────────────────────────────────────────────────────────

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex'); // 256-bit entropy
  const key = `sdg_${raw}`;
  const prefix = `sdg_${raw.slice(0, 8)}`;
  return { key, prefix, hash: hashKey(key) };
}

// ─── D1 DB resolution with build lock ────────────────────────────────────────

// Coalesces concurrent cold-cache requests — only one build runs per project.
const d1Building = new Map<string, Promise<void>>();

/**
 * Provision an empty WAL-mode SQLite file for a project that has no generated
 * data yet, so schema-creating writes (migrations) have somewhere to land.
 * Returns null if the project itself does not exist.
 */
function createEmptyProjectDb(projectId: string): string | null {
  if (!projectStore.get(projectId)) return null;
  ensureProjectDataDir();
  const dbPath = projectDbPath(projectId);
  // Opening creates the file; the pragma persists WAL mode in the header so
  // the cached connection and the UI agree on journal mode.
  const seed = new BetterSqlite3(dbPath);
  try { seed.pragma('journal_mode = WAL'); } finally { seed.close(); }
  return dbPath;
}

/**
 * Resolve the project's persistent SQLite data file — the same DB the UI reads
 * and writes (save-data / query-saved / export). This is the single source of
 * truth, so D1 writes via /execute persist and are visible in the UI.
 *
 * If the file already exists it is used as-is (the UI owns its lifecycle).
 * As a fallback, when no saved DB exists yet, build one from the latest
 * completed job so the API works immediately after generation without an
 * explicit UI save.
 *
 * `createIfMissing` provisions an empty DB when neither a saved file nor a
 * completed job exists. Write paths need this: a migration runner sends DDL
 * before any data exists, and 404-ing there is a chicken-and-egg deadlock
 * (can't create tables because no tables were created yet).
 */
async function resolveD1Db(
  projectId: string,
  opts: { createIfMissing?: boolean } = {},
): Promise<string | null> {
  const dbPath = projectDbPath(projectId);
  if (fs.existsSync(dbPath)) return dbPath;

  type JobRow = { id: string; data: string };
  const row = mainDb.prepare(`
    SELECT id, data FROM jobs
    WHERE status = 'done'
      AND json_extract(data, '$.projectId') = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(projectId) as JobRow | undefined;

  const job = row ? (JSON.parse(row.data) as GenerationJob) : undefined;

  if (!job?.resultPaths) {
    if (!opts.createIfMissing) return null;
    return createEmptyProjectDb(projectId);
  }

  let build = d1Building.get(projectId);
  if (!build) {
    const project = projectStore.get(projectId);
    if (!project) return null;
    ensureProjectDataDir();
    // A cached connection would pin the old file (Windows: unlink fails on
    // open handles) and keep serving stale data after the rebuild.
    closeProjectDb(projectId);
    build = buildSqliteDb(project.tables, job.resultPaths, dbPath)
      .finally(() => { d1Building.delete(projectId); });
    d1Building.set(projectId, build);
  }
  await build;

  return dbPath;
}

// ─── D1 wire types ────────────────────────────────────────────────────────────

type D1Success<T = Record<string, unknown>> = {
  results: T[];
  lastRowId: number | null;
  changes: number;
  duration: number;
};
type D1Error = { error: string };

// ─── Body validation ──────────────────────────────────────────────────────────

type ParsedStmt = { sql: string; params: unknown[] };

function parseSingleBody(body: unknown): ParsedStmt | D1Error {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object with sql string' };
  }
  const { sql, params } = body as Record<string, unknown>;
  if (typeof sql !== 'string' || !sql.trim()) {
    return { error: 'sql must be a non-empty string' };
  }
  if (params !== undefined && !Array.isArray(params)) {
    return { error: 'params must be an array' };
  }
  return { sql, params: (params as unknown[]) ?? [] };
}

function parseBatchBody(body: unknown): ParsedStmt[] | D1Error {
  if (!Array.isArray(body)) return { error: 'Batch body must be a JSON array' };
  const out: ParsedStmt[] = [];
  for (let i = 0; i < body.length; i++) {
    const r = parseSingleBody(body[i]);
    if ('error' in r) return { error: `Statement[${i}]: ${r.error}` };
    out.push(r);
  }
  return out;
}

// ─── SQL execution ────────────────────────────────────────────────────────────

// .all() rejects statements that return no rows (DDL, INSERT/UPDATE/DELETE)
// with this exact message. D1's /query runs them fine, so retry with .run().
const NO_DATA_MSG = 'This statement does not return data. Use run() instead';

function execQuery<T>(
  db: BetterSqlite3.Database,
  sql: string,
  params: unknown[],
): D1Success<T> | D1Error {
  if (BLOCKED_SQL_RE.test(sql)) return { error: 'ATTACH and DETACH are not permitted' };
  const t0 = Date.now();
  try {
    const rows = db.prepare(sql).all(...params) as T[];
    return { results: rows, lastRowId: null, changes: 0, duration: Date.now() - t0 };
  } catch (e) {
    if ((e as Error).message === NO_DATA_MSG) {
      const info = execStatement(db, sql, params);
      return 'error' in info ? info : { ...info, results: [] as T[] };
    }
    return { error: (e as Error).message };
  }
}

// better-sqlite3's prepare() rejects semicolon-separated SQL with this exact
// RangeError. Semicolon counting can't detect it (they appear inside string
// literals), so the thrown error is the detector.
const MULTI_STMT_MSG = 'The supplied SQL string contains more than one statement';

function execStatement(
  db: BetterSqlite3.Database,
  sql: string,
  params: unknown[],
): D1Success<never> | D1Error {
  if (BLOCKED_SQL_RE.test(sql)) return { error: 'ATTACH and DETACH are not permitted' };
  const t0 = Date.now();
  try {
    const info = db.prepare(sql).run(...params);
    return {
      results: [],
      lastRowId: typeof info.lastInsertRowid === 'bigint'
        ? Number(info.lastInsertRowid)
        : (info.lastInsertRowid as number | null),
      changes: info.changes,
      duration: Date.now() - t0,
    };
  } catch (e) {
    // D1's /execute accepts semicolon-separated SQL — migration files arrive as
    // one multi-statement string. exec() runs those; it binds no params, so this
    // path is only valid when none were supplied.
    if ((e as Error).message === MULTI_STMT_MSG && params.length === 0) {
      try {
        db.exec(sql);
        return { results: [], lastRowId: null, changes: 0, duration: Date.now() - t0 };
      } catch (e2) {
        return { error: (e2 as Error).message };
      }
    }
    return { error: (e as Error).message };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Positive-lookup cache skips a main-DB read per request; last_used_at is
// throttled to one write per key per minute — it was a hot-path fsync for
// purely cosmetic data. Both maps are invalidated on key deletion below.
const AUTH_CACHE_TTL_MS = 60_000;
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const authCache = new Map<string, { keyId: string; expires: number }>(); // `${projectId}:${hash}`
const lastUsedWrittenAt = new Map<string, number>(); // keyId → epoch ms

function authenticate(authHeader: string | undefined, projectId: string): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const hash = hashKey(authHeader.slice(7));
  const cacheKey = `${projectId}:${hash}`;
  const now = Date.now();

  let keyId: string;
  const cached = authCache.get(cacheKey);
  if (cached && cached.expires > now) {
    keyId = cached.keyId;
  } else {
    const row = mainDb.prepare(`
      SELECT id FROM project_api_keys WHERE key_hash = ? AND project_id = ?
    `).get(hash, projectId) as { id: string } | undefined;
    if (!row) return false;
    keyId = row.id;
    authCache.set(cacheKey, { keyId, expires: now + AUTH_CACHE_TTL_MS });
  }

  if (now - (lastUsedWrittenAt.get(keyId) ?? 0) >= LAST_USED_WRITE_INTERVAL_MS) {
    lastUsedWrittenAt.set(keyId, now);
    mainDb.prepare(`UPDATE project_api_keys SET last_used_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), keyId);
  }
  return true;
}

function invalidateAuthCacheForKey(keyId: string): void {
  for (const [k, v] of authCache) {
    if (v.keyId === keyId) authCache.delete(k);
  }
  lastUsedWrittenAt.delete(keyId);
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function d1Routes(app: FastifyInstance) {

  // ── POST /db/:projectId/query ──────────────────────────────────────────────
  // Supports single { sql, params? } and batch [{ sql, params? }].
  // Batch runs atomically inside a transaction (matches D1 behavior).

  app.post<{ Params: { projectId: string } }>(
    '/db/:projectId/query',
    async (req, reply) => {
      const { projectId } = req.params;
      if (!PROJECT_ID_RE.test(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }
      if (!authenticate(req.headers.authorization, projectId)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // Parse before resolving the DB: migration runners send DDL through
      // /query, so a write-bearing body must provision an empty DB rather than
      // 404. Pure reads keep the "run generate first" hint.
      const body = Array.isArray(req.body) ? parseBatchBody(req.body) : parseSingleBody(req.body);
      if ('error' in body) return reply.code(400).send(body);
      const stmts = Array.isArray(body) ? body : [body];

      const dbPath = await resolveD1Db(projectId, { createIfMissing: hasWrite(stmts) });
      if (!dbPath) {
        return reply.code(404).send({ error: 'No generated data. Run generate first.' });
      }

      if (Array.isArray(body)) {
        // ── Batch (atomic) ─────────────────────────────────────────────────
        const db = getProjectDb(projectId, dbPath);
        try {
          let results: D1Success[] = [];
          // Wrapping in a transaction makes the batch atomic:
          // if any statement throws, all preceding changes roll back.
          const runBatch = db.transaction(() => {
            results = body.map(s => {
              const r = execQuery<Record<string, unknown>>(db, s.sql, s.params);
              if ('error' in r) throw new Error(r.error);
              return r;
            });
          });
          runBatch();
          return reply.send(results);
        } catch (e) {
          return reply.code(400).send({ error: (e as Error).message });
        }
      } else {
        // ── Single ─────────────────────────────────────────────────────────
        const db = getProjectDb(projectId, dbPath);
        const result = execQuery(db, body.sql, body.params);
        if ('error' in result) return reply.code(400).send(result);
        return reply.send(result);
      }
    },
  );

  // ── POST /db/:projectId/execute ────────────────────────────────────────────

  app.post<{ Params: { projectId: string } }>(
    '/db/:projectId/execute',
    async (req, reply) => {
      const { projectId } = req.params;
      if (!PROJECT_ID_RE.test(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }
      if (!authenticate(req.headers.authorization, projectId)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const parsed = parseSingleBody(req.body);
      if ('error' in parsed) return reply.code(400).send(parsed);

      // Writes may be schema-creating (migrations), so provision an empty DB
      // rather than 404 when the project has no generated data yet.
      const dbPath = await resolveD1Db(projectId, { createIfMissing: true });
      if (!dbPath) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const db = getProjectDb(projectId, dbPath);
      const result = execStatement(db, parsed.sql, parsed.params);
      if ('error' in result) return reply.code(400).send(result);
      return reply.send(result);
    },
  );

  // ── POST /db/:projectId/dump ───────────────────────────────────────────────
  // Streams the SQLite file — avoids loading the entire DB into memory.

  app.post<{ Params: { projectId: string } }>(
    '/db/:projectId/dump',
    async (req, reply) => {
      const { projectId } = req.params;
      if (!PROJECT_ID_RE.test(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }
      if (!authenticate(req.headers.authorization, projectId)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const dbPath = await resolveD1Db(projectId);
      if (!dbPath) {
        return reply.code(404).send({ error: 'No generated data. Run generate first.' });
      }

      // Cached connection may hold recent commits in the -wal sidecar;
      // flush so the raw file stream is complete.
      checkpointProjectDb(projectId);

      return reply
        .type('application/x-sqlite3')
        .send(fs.createReadStream(dbPath));
    },
  );

  // ── GET /api/v1/projects/:projectId/api-keys ──────────────────────────────

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/api-keys',
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectStore.get(projectId)) {
        return reply.code(404).send({ ok: false, error: 'Project not found' });
      }
      type Row = {
        id: string; project_id: string; name: string;
        key_prefix: string; created_at: string; last_used_at: string | null;
      };
      const rows = mainDb.prepare(`
        SELECT id, project_id, name, key_prefix, created_at, last_used_at
        FROM project_api_keys
        WHERE project_id = ?
        ORDER BY created_at DESC
      `).all(projectId) as Row[];

      const keys: ProjectApiKey[] = rows.map(r => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        keyPrefix: r.key_prefix,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
      }));
      return reply.send({ ok: true, data: keys });
    },
  );

  // ── POST /api/v1/projects/:projectId/api-keys ─────────────────────────────
  // Returns the full key ONCE — not stored in plaintext anywhere.

  app.post<{ Params: { projectId: string }; Body: { name?: string } }>(
    '/api/v1/projects/:projectId/api-keys',
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectStore.get(projectId)) {
        return reply.code(404).send({ ok: false, error: 'Project not found' });
      }
      const name = (req.body?.name ?? '').trim() || 'Default';
      const { key, prefix, hash } = generateApiKey();
      const id = nanoid();
      const now = new Date().toISOString();

      mainDb.prepare(`
        INSERT INTO project_api_keys (id, project_id, name, key_hash, key_prefix, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, projectId, name, hash, prefix, now);

      return reply.code(201).send({
        ok: true,
        data: {
          id,
          projectId,
          name,
          keyPrefix: prefix,
          key,
          createdAt: now,
          lastUsedAt: null,
        } satisfies ProjectApiKey & { key: string },
      });
    },
  );

  // ── DELETE /api/v1/projects/:projectId/api-keys/:keyId ────────────────────

  app.delete<{ Params: { projectId: string; keyId: string } }>(
    '/api/v1/projects/:projectId/api-keys/:keyId',
    async (req, reply) => {
      const { projectId, keyId } = req.params;
      if (!projectStore.get(projectId)) {
        return reply.code(404).send({ ok: false, error: 'Project not found' });
      }
      const result = mainDb.prepare(`
        DELETE FROM project_api_keys WHERE id = ? AND project_id = ?
      `).run(keyId, projectId);
      if (result.changes === 0) {
        return reply.code(404).send({ ok: false, error: 'API key not found' });
      }
      invalidateAuthCacheForKey(keyId);
      return reply.send({ ok: true });
    },
  );
}
