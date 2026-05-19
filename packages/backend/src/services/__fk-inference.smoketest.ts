/**
 * Smoke test for fk-inference.service.ts. Not wired to a test runner — run with:
 *   cd packages/backend && npx tsx src/services/__fk-inference.smoketest.ts
 *
 * Verifies the inference against a representative code-first ORM dump that
 * ships without FOREIGN KEY clauses.
 */
import { parseSQLMultiple } from './sql-parser.service.js';
import { inferFkCandidates } from './fk-inference.service.js';

const sql = `
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255)
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  total DECIMAL
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER
);

CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  parent_id UUID
);

CREATE TABLE comments (
  id UUID PRIMARY KEY,
  body TEXT,
  commentable_id UUID,
  commentable_type VARCHAR(50)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id INTEGER
);
`;

const { tables, warnings } = parseSQLMultiple(sql);
const candidates = inferFkCandidates(tables);

console.log('Parsed tables:', tables.map((t) => `${t.tableName}(${t.columns.map((c) => c.name).join(',')})`).join('; '));
if (warnings.length) console.log('Warnings:', warnings);
console.log(`\nCandidates (${candidates.length}):`);
for (const c of candidates) {
  const self = c.selfReference ? ' [self]' : '';
  console.log(`  ${c.fromTable}.${c.fromColumn} → ${c.toTable}.${c.toColumn}  [${(c.confidence * 100).toFixed(0)}%]${self}`);
  for (const r of c.reasons) console.log(`    · ${r}`);
}

// Assertions
const expected: Array<[string, string, string, string]> = [
  ['orders',      'user_id',    'users',     'id'],
  ['order_items', 'order_id',   'orders',    'id'],
  ['order_items', 'product_id', 'products',  'id'],
  ['categories',  'parent_id',  'categories','id'],
];
const got = new Set(candidates.map((c) => `${c.fromTable}.${c.fromColumn}->${c.toTable}.${c.toColumn}`));

let failed = false;
for (const [ft, fc, tt, tc] of expected) {
  const key = `${ft}.${fc}->${tt}.${tc}`;
  if (!got.has(key)) { console.error(`MISSING: ${key}`); failed = true; }
}
// Polymorphic should be suppressed
if (candidates.some((c) => c.fromColumn === 'commentable_id')) {
  console.error('FAIL: polymorphic commentable_id should be suppressed');
  failed = true;
}
// Type mismatch should be suppressed (audit_logs.user_id INTEGER vs users.id UUID)
if (candidates.some((c) => c.fromTable === 'audit_logs' && c.fromColumn === 'user_id')) {
  console.error('FAIL: audit_logs.user_id (INTEGER) → users.id (UUID) should be suppressed by type check');
  failed = true;
}
// Self-reference should be flagged
const selfRef = candidates.find((c) => c.fromTable === 'categories' && c.fromColumn === 'parent_id');
if (selfRef && !selfRef.selfReference) {
  console.error('FAIL: categories.parent_id → categories.id should set selfReference: true');
  failed = true;
}

console.log(failed ? '\n❌ FAIL' : '\n✓ OK');
process.exit(failed ? 1 : 0);
