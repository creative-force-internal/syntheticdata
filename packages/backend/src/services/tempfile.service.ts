/**
 * Temp-file helpers for generation job output.
 * Jobs write JSONL (one JSON row per line) to OS temp dir.
 * Export routes stream/transform these files on demand.
 */

import path from 'path';
import fs from 'fs';
import readline from 'readline';
import type { GeneratedRow } from '../types/index.js';
import { dataDir } from '../db/database.js';

const TEMP_DIR = path.join(dataDir, 'synthetic-jobs');

export function getTempDir(): string {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

/**
 * Resolve a path and assert it stays inside the controlled temp directory.
 * Defense-in-depth against path-traversal attempts that slip through input
 * validation upstream.
 */
export function isInsideTempDir(p: string): boolean {
  const resolvedRoot = path.resolve(getTempDir());
  const resolvedTarget = path.resolve(p);
  return resolvedTarget === resolvedRoot
    || resolvedTarget.startsWith(resolvedRoot + path.sep);
}

export function jobTempPath(jobId: string, suffix = 'jsonl'): string {
  const candidate = path.join(getTempDir(), `${jobId}_${suffix}.jsonl`);
  if (!isInsideTempDir(candidate)) {
    throw new Error(`Refusing to build temp path outside temp dir: ${candidate}`);
  }
  return candidate;
}

/** Append a chunk of rows as JSONL lines to a temp file. */
export async function appendJsonlChunk(filePath: string, rows: GeneratedRow[]): Promise<void> {
  const lines = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
  await fs.promises.appendFile(filePath, lines, 'utf8');
}

/** Read up to `limit` rows from a JSONL file (for preview). */
export async function readJsonlRows(filePath: string, limit: number): Promise<GeneratedRow[]> {
  if (!fs.existsSync(filePath)) return [];
  const rows: GeneratedRow[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as GeneratedRow);
    if (rows.length >= limit) {
      rl.close();
      break;
    }
  }
  return rows;
}

/** Delete all temp files associated with a job. */
export function cleanupJobFiles(jobId: string): void {
  try {
    const dir = getTempDir();
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(jobId)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}
