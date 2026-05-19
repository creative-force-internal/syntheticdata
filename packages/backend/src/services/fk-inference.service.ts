/**
 * FK relationship inference for imported schemas.
 *
 * Scans non-FK columns whose names look like FKs (end in `_id` / `Id` / `ID`)
 * and proposes target PK columns based on name + type matching. Used by SQL
 * imports where the source dump lacks explicit FOREIGN KEY clauses (common
 * when the DB is owned by a code-first ORM).
 *
 * Phase A1 of PLAN-fk-features.md: returns candidates only. Caller decides
 * whether to materialise them into the schema.
 */

import type { ColumnDataType, ColumnSchema } from '../types/index.js';

export interface FkCandidate {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  confidence: number;        // 0–1
  reasons: string[];
  selfReference?: boolean;
}

type ParsedColumn = Omit<ColumnSchema, 'id'>;
type ParsedTable  = { tableName: string; columns: ParsedColumn[] };

const MIN_CONFIDENCE = 0.6;

// Role labels that typically denote a self-reference (e.g. categories.parent_id → categories.id).
// When the subject extracted from a column name matches one of these AND the column has no
// external-table match, we treat it as a candidate self-FK against the owner's own PK.
const SELF_REF_ROLES = new Set([
  'parent', 'child', 'owner', 'creator', 'author',
  'manager', 'supervisor', 'referrer', 'referred_by',
  'predecessor', 'successor', 'replied_to', 'reply_to',
]);

// Common irregular plurals. Regular `-s` / `-es` / `-ies` handled below.
const IRREGULAR: Record<string, string> = {
  person: 'people',
  child:  'children',
  man:    'men',
  woman:  'women',
  tooth:  'teeth',
  foot:   'feet',
  mouse:  'mice',
  goose:  'geese',
  ox:     'oxen',
};

function singularize(word: string): string {
  const lower = word.toLowerCase();
  for (const [sing, plur] of Object.entries(IRREGULAR)) {
    if (lower === plur) return sing;
  }
  if (lower.endsWith('ies') && lower.length > 3) return lower.slice(0, -3) + 'y';
  if (/(ses|shes|ches|xes|zes)$/.test(lower))    return lower.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 1)   return lower.slice(0, -1);
  return lower;
}

function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) return lower.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x|z)$/.test(lower))                    return lower + 'es';
  return lower + 's';
}

/** Strip the FK suffix from a column name; return the subject or null. */
function extractSubject(colName: string): string | null {
  // user_id → user, userId → user, UserId → User, fk_user_id → user
  const m = colName.match(/^(?:fk_)?(.+?)(?:_id|Id|ID)$/);
  if (!m) return null;
  const s = m[1].trim();
  return s.length > 0 ? s : null;
}

function typesCompatible(a: ColumnDataType, b: ColumnDataType): boolean {
  if (a === b) return true;
  // Both integer-family widths get normalised to 'integer' by mapSqlType, so
  // mismatches here are genuine (e.g. uuid vs integer).
  return false;
}

/** Detect polymorphic association: `<subject>_type` column alongside the FK candidate. */
function hasPolymorphicTypeColumn(subject: string, columns: ParsedColumn[]): boolean {
  const wantSnake = (subject + '_type').toLowerCase();
  const wantCamel = (subject + 'Type').toLowerCase();
  return columns.some((c) => {
    const n = c.name.toLowerCase();
    return n === wantSnake || n === wantCamel;
  });
}

/** Find PK targets whose table name matches the subject (singular / plural / exact). */
function findTargetTables(
  subject: string,
  tables: ParsedTable[],
): Array<{ table: ParsedTable; pkColumn: ParsedColumn; nameDelta: number; nameReason: string }> {
  const subjLower    = subject.toLowerCase();
  const subjSingular = singularize(subjLower);
  const subjPlural   = pluralize(subjLower);
  const matches: Array<{ table: ParsedTable; pkColumn: ParsedColumn; nameDelta: number; nameReason: string }> = [];

  for (const tbl of tables) {
    const tnameLower = tbl.tableName.toLowerCase();
    let nameDelta = 0;
    let nameReason = '';

    if (tnameLower === subjLower) {
      nameDelta  = 0.5;
      nameReason = `name match: ${subject} → ${tbl.tableName}`;
    } else if (tnameLower === subjSingular || tnameLower === subjPlural) {
      nameDelta  = 0.65;
      nameReason = `name match (singular/plural): ${subject} → ${tbl.tableName}`;
    } else {
      continue;
    }

    const pkCols = tbl.columns.filter((c) => c.indexType === 'primary_key');
    if (pkCols.length !== 1) continue;  // skip composite or PK-less tables for v1
    matches.push({ table: tbl, pkColumn: pkCols[0], nameDelta, nameReason });
  }
  return matches;
}

/**
 * Infer FK candidates across a parsed schema.
 *
 * Skips columns that already have `indexType === 'foreign_key'` so explicit
 * REFERENCES clauses always win. Returns only candidates above MIN_CONFIDENCE.
 */
export function inferFkCandidates(tables: ParsedTable[]): FkCandidate[] {
  const candidates: FkCandidate[] = [];

  for (const owner of tables) {
    for (const col of owner.columns) {
      if (col.indexType === 'foreign_key') continue;
      if (col.indexType === 'primary_key') continue;

      const subject = extractSubject(col.name);
      if (!subject) continue;

      if (hasPolymorphicTypeColumn(subject, owner.columns)) continue;

      const targets = findTargetTables(subject, tables);

      // Self-ref fallback: role-label columns (parent_id, owner_id, ...) point at the
      // owner's own PK when no external table matches.
      if (targets.length === 0 && SELF_REF_ROLES.has(subject.toLowerCase())) {
        const ownerPks = owner.columns.filter((c) => c.indexType === 'primary_key');
        if (ownerPks.length === 1) {
          targets.push({
            table:      owner,
            pkColumn:   ownerPks[0],
            nameDelta:  0.5,
            nameReason: `self-ref role label: ${subject}_id → ${owner.tableName}.${ownerPks[0].name}`,
          });
        }
      }

      if (targets.length === 0) continue;

      const ambiguityPenalty = targets.length > 1 ? 0.2 : 0;
      const ambiguityReason  = targets.length > 1
        ? `ambiguous: "${subject}" matches ${targets.map((t) => t.table.tableName).join(', ')}`
        : null;

      for (const target of targets) {
        if (!typesCompatible(col.dataType, target.pkColumn.dataType)) continue;

        const reasons: string[] = [target.nameReason];
        let confidence = target.nameDelta;

        // Type match (gated above)
        confidence += 0.25;
        reasons.push(`type match: ${col.dataType}`);

        // Implicit gates already passed
        confidence += 0.10;
        reasons.push(`column ends in _id/Id`);
        confidence += 0.10;
        reasons.push(`parent has single PK`);

        if (ambiguityPenalty > 0) {
          confidence -= ambiguityPenalty;
          if (ambiguityReason) reasons.push(ambiguityReason);
        }

        const selfReference = target.table.tableName === owner.tableName;
        if (selfReference) {
          confidence -= 0.05;
          reasons.push('self-reference');
        }

        confidence = Math.max(0, Math.min(1, confidence));
        if (confidence < MIN_CONFIDENCE) continue;

        candidates.push({
          fromTable:  owner.tableName,
          fromColumn: col.name,
          toTable:    target.table.tableName,
          toColumn:   target.pkColumn.name,
          confidence,
          reasons,
          ...(selfReference ? { selfReference: true } : {}),
        });
      }
    }
  }

  return candidates;
}
