/**
 * Cached connections to per-project SQLite data files.
 *
 * Opening a new better-sqlite3 connection per request pays file open, cold
 * page cache, and a fresh parse+plan for every statement. Reusing one
 * connection per project keeps the prepared-statement cache and page cache
 * warm, dropping per-request overhead to near zero.
 *
 * Invariants:
 *   - Any code that unlinks or rebuilds a project DB file MUST call
 *     closeProjectDb() first — Windows cannot delete a file with an open
 *     handle, and a cached connection would keep serving the old inode.
 *   - Any code that streams the raw .db file MUST call checkpointProjectDb()
 *     first — a live connection keeps recent commits in the -wal sidecar,
 *     so the main file alone may be stale.
 */

import BetterSqlite3 from 'better-sqlite3';

const IDLE_CLOSE_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

type CacheEntry = { db: BetterSqlite3.Database; lastUsed: number };

const cache = new Map<string, CacheEntry>();

export function getProjectDb(projectId: string, dbPath: string): BetterSqlite3.Database {
  const hit = cache.get(projectId);
  if (hit) {
    hit.lastUsed = Date.now();
    return hit.db;
  }
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');   // 64 MB page cache
  db.pragma('mmap_size = 268435456'); // 256 MB memory-mapped I/O
  cache.set(projectId, { db, lastUsed: Date.now() });
  return db;
}

/** Close and evict the cached connection. Call before rebuilding/unlinking the file. */
export function closeProjectDb(projectId: string): void {
  const hit = cache.get(projectId);
  if (!hit) return;
  cache.delete(projectId);
  try { hit.db.close(); } catch { /* already closed */ }
}

/** Flush WAL into the main .db file so raw-file reads see all commits. */
export function checkpointProjectDb(projectId: string): void {
  const hit = cache.get(projectId);
  if (!hit) return;
  try { hit.db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* best effort */ }
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - IDLE_CLOSE_MS;
  for (const [id, entry] of cache) {
    if (entry.lastUsed < cutoff) {
      cache.delete(id);
      try { entry.db.close(); } catch { /* ignore */ }
    }
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref();
