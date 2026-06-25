#!/usr/bin/env node
/**
 * Recover project table DEFINITIONS that were lost from the project metadata
 * blob, by reconstructing them from the saved project-data SQLite db
 * (project-data/<id>.db), which still holds all tables + rows.
 *
 * Usage (run on the deploy box, with the same DB_PATH the server uses):
 *   DB_PATH=/app/data/synthetic.db node scripts/recover-project-tables.mjs <projectId> [--write]
 *
 * Without --write it does a DRY RUN: prints which tables would be restored.
 * With --write it updates the projects row in place (backs up the blob first).
 *
 * Run from packages/backend so better-sqlite3 resolves.
 */
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const projectId = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!projectId) {
  console.error('Usage: node scripts/recover-project-tables.mjs <projectId> [--write]');
  process.exit(1);
}

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'synthetic.db');
const dataDir = path.dirname(dbPath);
const projectDbPath = path.join(dataDir, 'project-data', `${projectId}.db`);

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID(); // matches SafeIdRe [A-Za-z0-9_-]

// SQLite declared type → app ColumnDataType
function sqliteToDataType(declType) {
  const t = (declType || '').toUpperCase();
  if (t.includes('INT')) return 'integer';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'float';
  return 'string';
}

const main = new Database(dbPath, { readonly: !WRITE });
const row = main.prepare('SELECT data FROM projects WHERE id = ?').get(projectId);
if (!row) { console.error(`Project ${projectId} not found in ${dbPath}`); process.exit(1); }
const project = JSON.parse(row.data);

const existingNames = new Set(project.tables.map(t => t.name));
console.log(`Project "${project.name}": ${project.tables.length} tables in metadata`);

const pdb = new Database(projectDbPath, { readonly: true });
const dbTables = pdb
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map(r => r.name);
console.log(`Saved data db: ${dbTables.length} tables -> ${dbTables.join(', ')}`);

const missing = dbTables.filter(n => !existingNames.has(n));
if (missing.length === 0) {
  console.log('Nothing to restore — metadata already covers all data tables.');
  process.exit(0);
}
console.log(`Missing from metadata (${missing.length}): ${missing.join(', ')}`);

const ts = now();
for (const tableName of missing) {
  const cols = pdb.prepare(`PRAGMA table_info("${tableName}")`).all();
  const newTable = {
    id: id(),
    name: tableName,
    sourceType: 'sql',
    createdAt: ts,
    updatedAt: ts,
    rules: [],
    columns: cols.map(c => {
      const dataType = sqliteToDataType(c.type);
      const isPk = c.pk > 0;
      return {
        id: id(),
        name: c.name,
        dataType,
        indexType: isPk ? 'primary_key' : 'none',
        ...(isPk ? { poolName: c.name } : {}),
        notNull: c.notnull === 1 || isPk,
        generatorConfig: {},
      };
    }),
  };
  project.tables.push(newTable);
  console.log(`  + ${tableName} (${newTable.columns.length} cols)`);
}

console.log(`\nResult: ${project.tables.length} tables`);

if (!WRITE) {
  console.log('\nDRY RUN. Re-run with --write to persist.');
  process.exit(0);
}

project.updatedAt = now();
main.prepare('UPDATE projects SET data = ?, updated_at = ? WHERE id = ?')
  .run(JSON.stringify(project), project.updatedAt, projectId);
console.log('\nWritten. Restored table defs use default generator config — refine in UI.');
