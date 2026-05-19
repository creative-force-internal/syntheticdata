/**
 * C# Entity Framework Core schema parser.
 * Accepts a set of source files (DbContext + entity classes) and produces a
 * multi-table Project. Pure string/regex — no Roslyn, no new dependencies.
 *
 * Supported:
 *   - DbContext class with `DbSet<Entity> PropName { get; set; }` discovery
 *   - Entity classes with public auto-properties
 *   - Attributes: [Key], [Required], [ForeignKey("...")], [Column("...")],
 *     [NotMapped], [Table("...")]
 *   - Convention-based PK (Id / <ClassName>Id) and FK (<NavProp>Id)
 *   - Best-effort OnModelCreating fluent regex (HasKey, HasOne/WithMany/HasForeignKey,
 *     ToTable, Property().HasColumnName)
 *
 * Out of scope (deliberate): TPH/TPT inheritance, owned entities, value
 * converters, shadow properties, indexes, [StringLength]/[Range]/[MaxLength],
 * multi-DbContext.
 */

import { nanoid } from 'nanoid';
import type { ColumnDataType, ColumnSchema, DatasetSchema, GeneratorConfig, Project } from '../types/index.js';

// ─── C# scalar → ColumnDataType ──────────────────────────────────────────────

const TYPE_MAP: Record<string, ColumnDataType> = {
  int: 'integer', long: 'integer', short: 'integer', byte: 'integer', sbyte: 'integer',
  uint: 'integer', ulong: 'integer', ushort: 'integer',
  int16: 'integer', int32: 'integer', int64: 'integer',
  decimal: 'float', double: 'float', float: 'float', single: 'float',
  bool: 'boolean', boolean: 'boolean',
  string: 'string', char: 'string',
  guid: 'uuid',
  datetime: 'datetime', datetimeoffset: 'datetime',
  dateonly: 'date',
};

const VALUE_TYPES = new Set([
  'int','long','short','byte','sbyte','uint','ulong','ushort',
  'int16','int32','int64',
  'decimal','double','float','single',
  'bool','boolean','char','guid','datetime','datetimeoffset','dateonly','timeonly','timespan',
]);

const COLLECTION_WRAPPERS = ['ICollection', 'IEnumerable', 'List', 'IList', 'HashSet', 'IReadOnlyCollection', 'IReadOnlyList'];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CsharpEfFile {
  filename: string;
  content: string;
}

interface CsType {
  raw: string;
  inner: string;          // simple type name after stripping wrappers, namespaces, '?'
  nullable: boolean;
  isCollection: boolean;
}

interface ParsedProperty {
  name: string;
  type: CsType;
  attributes: string[];
  isKey: boolean;
  isRequired: boolean;
  fkTargetNav?: string;       // if [ForeignKey("NavName")] on this scalar prop
  columnNameOverride?: string;
  notMapped: boolean;
}

interface ParsedEntity {
  className: string;
  filename: string;
  tableName: string;          // resolved later
  classTableAttr?: string;    // [Table("...")]
  properties: ParsedProperty[];
  navByName: Map<string, { propName: string; targetClass: string; isCollection: boolean; fkScalarHint?: string }>;
}

interface FluentInfo {
  hasKey:        Map<string, string[]>;                // entity → [columnNames]
  toTable:       Map<string, string>;                  // entity → tableName
  hasColumnName: Map<string, Map<string, string>>;     // entity → (propName → columnName)
  // hasOne(navProp).withMany(...).hasForeignKey(scalarProps)
  fkChain:       Array<{ entity: string; navProp: string; fkProps: string[] }>;
}

// ─── Type parsing ─────────────────────────────────────────────────────────────

function parseType(raw: string): CsType {
  let s = raw.trim();
  // Strip namespace prefix(es)
  s = s.replace(/^System\./i, '').replace(/^[\w.]+\./, '');
  let isCollection = false;
  // Detect collection wrapper
  for (const wrap of COLLECTION_WRAPPERS) {
    const m = new RegExp(`^${wrap}<(.+)>$`, 'i').exec(s);
    if (m) { isCollection = true; s = m[1].trim(); break; }
  }
  // Array form (T[])
  const arr = /^([\w.<>?]+)\[\]$/.exec(s);
  if (arr) { isCollection = true; s = arr[1]; }
  // Nullable<T> wrapper
  const nullableWrap = /^Nullable<(.+)>$/i.exec(s);
  if (nullableWrap) s = nullableWrap[1].trim() + '?';
  const nullable = s.endsWith('?');
  if (nullable) s = s.slice(0, -1);
  // Strip generic args from inner (e.g. Dictionary<...>) — out of v1 scope, keep simple name
  const generic = /^(\w+)<.*>$/.exec(s);
  if (generic) s = generic[1];
  return { raw, inner: s, nullable, isCollection };
}

function mapDataType(inner: string, warn: (msg: string) => void, ctx: string): ColumnDataType {
  const key = inner.toLowerCase();
  if (TYPE_MAP[key]) return TYPE_MAP[key];
  if (key === 'timeonly' || key === 'timespan') {
    warn(`${inner} on ${ctx} mapped to string`);
    return 'string';
  }
  if (key === 'byte[]') return 'string';
  warn(`Unknown C# type '${inner}' on ${ctx} mapped to string`);
  return 'string';
}

function isValueType(inner: string): boolean {
  return VALUE_TYPES.has(inner.toLowerCase());
}

// ─── Brace-balanced body extraction ───────────────────────────────────────────

function extractBody(source: string, startIdx: number): { body: string; endIdx: number } | null {
  const open = source.indexOf('{', startIdx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { body: source.slice(open + 1, i), endIdx: i };
    }
  }
  return null;
}

// Strip /* */ and // comments to simplify regex matching downstream.
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

// ─── DbContext discovery ─────────────────────────────────────────────────────

interface DbContextInfo {
  className: string;
  filename: string;
  dbSets: Map<string, string>;   // EntityClass → DbSet property name
  fluent: FluentInfo;
}

function findDbContexts(files: CsharpEfFile[], warn: (msg: string) => void): DbContextInfo[] {
  const found: DbContextInfo[] = [];
  for (const file of files) {
    const src = stripComments(file.content);
    const re = /class\s+(\w+)\s*:\s*[\w<>,\s.]*\bDbContext\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const className = m[1];
      const body = extractBody(src, m.index);
      if (!body) continue;
      const dbSets = new Map<string, string>();
      const dbSetRe = /public\s+(?:virtual\s+)?DbSet<\s*(\w+)\s*>\s+(\w+)\s*{\s*get\s*;\s*set\s*;\s*}/g;
      let dm: RegExpExecArray | null;
      while ((dm = dbSetRe.exec(body.body)) !== null) {
        dbSets.set(dm[1], dm[2]);
      }
      const fluent = extractFluent(body.body, warn);
      found.push({ className, filename: file.filename, dbSets, fluent });
    }
  }
  if (found.length > 1) {
    warn(`Multiple DbContext classes found (${found.map(d => d.className).join(', ')}); using ${found[0].className}`);
  }
  return found;
}

function extractFluent(contextBody: string, warn: (msg: string) => void): FluentInfo {
  const info: FluentInfo = {
    hasKey: new Map(),
    toTable: new Map(),
    hasColumnName: new Map(),
    fkChain: [],
  };
  // Find OnModelCreating body
  const onModel = /OnModelCreating\s*\(\s*ModelBuilder\s+\w+\s*\)/.exec(contextBody);
  if (!onModel) return info;
  const body = extractBody(contextBody, onModel.index);
  if (!body) return info;
  const text = body.body;

  // Entity<T>() blocks: collect each invocation chain
  const entityRe = /modelBuilder\s*\.\s*Entity\s*<\s*(\w+)\s*>\s*\(/g;
  let em: RegExpExecArray | null;
  let parsedAny = false;
  while ((em = entityRe.exec(text)) !== null) {
    const entity = em[1];
    parsedAny = true;
    // Slice forward until the next `;` at top level — best effort
    const start = em.index;
    let semi = text.indexOf(';', start);
    if (semi < 0) semi = text.length;
    const chain = text.slice(start, semi);

    // .HasKey(x => x.Prop) | .HasKey(x => new { x.A, x.B })
    const hasKeyM = /\.HasKey\s*\(\s*\w+\s*=>\s*(?:\w+\.(\w+)|new\s*\{([^}]+)\})\s*\)/.exec(chain);
    if (hasKeyM) {
      const props = hasKeyM[1]
        ? [hasKeyM[1]]
        : hasKeyM[2].split(',').map(p => p.replace(/^\s*\w+\./, '').trim()).filter(Boolean);
      info.hasKey.set(entity, props);
    }

    // .ToTable("name")
    const toTableM = /\.ToTable\s*\(\s*"([^"]+)"\s*\)/.exec(chain);
    if (toTableM) info.toTable.set(entity, toTableM[1]);

    // .Property(x => x.P).HasColumnName("name") — may appear multiple times
    const propColRe = /\.Property\s*\(\s*\w+\s*=>\s*\w+\.(\w+)\s*\)\s*\.HasColumnName\s*\(\s*"([^"]+)"\s*\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = propColRe.exec(chain)) !== null) {
      let m = info.hasColumnName.get(entity);
      if (!m) { m = new Map(); info.hasColumnName.set(entity, m); }
      m.set(pm[1], pm[2]);
    }

    // .HasOne(x => x.Nav).WithMany(...).HasForeignKey(x => x.Fk)
    const hasOneM = /\.HasOne\s*\(\s*\w+\s*=>\s*\w+\.(\w+)\s*\)/.exec(chain);
    const hasFkM = /\.HasForeignKey\s*\(\s*\w+\s*=>\s*(?:\w+\.(\w+)|new\s*\{([^}]+)\})\s*\)/.exec(chain);
    if (hasOneM && hasFkM) {
      const fkProps = hasFkM[1]
        ? [hasFkM[1]]
        : hasFkM[2].split(',').map(p => p.replace(/^\s*\w+\./, '').trim()).filter(Boolean);
      info.fkChain.push({ entity, navProp: hasOneM[1], fkProps });
    }
  }
  if (text.trim().length > 0 && !parsedAny) {
    warn('OnModelCreating body present but no Entity<T>() blocks could be extracted; fluent FK config ignored');
  }
  return info;
}

// ─── Entity class parsing ────────────────────────────────────────────────────

function findEntities(files: CsharpEfFile[], dbContextNames: Set<string>): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  for (const file of files) {
    const src = stripComments(file.content);
    // Match attributes immediately preceding a class declaration (capture them)
    const classRe = /((?:^|\n)(?:\s*\[[^\]\n]+\]\s*\n)*)\s*(?:public|internal)?\s*(?:partial\s+)?class\s+(\w+)\b/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(src)) !== null) {
      const attrBlock = m[1] ?? '';
      const className = m[2];
      if (dbContextNames.has(className)) continue;
      const body = extractBody(src, m.index);
      if (!body) continue;
      const tableAttr = /\[\s*Table\s*\(\s*"([^"]+)"\s*\)\s*\]/.exec(attrBlock)?.[1];
      const { properties, navByName } = parsePropertiesInBody(body.body);
      entities.push({
        className,
        filename: file.filename,
        tableName: '',
        classTableAttr: tableAttr,
        properties,
        navByName,
      });
    }
  }
  return entities;
}

interface PropertiesParseResult {
  properties: ParsedProperty[];
  navByName: Map<string, { propName: string; targetClass: string; isCollection: boolean; fkScalarHint?: string }>;
}

function parsePropertiesInBody(body: string): PropertiesParseResult {
  const lines = body.split(/\r?\n/);
  const props: ParsedProperty[] = [];
  const nav = new Map<string, { propName: string; targetClass: string; isCollection: boolean; fkScalarHint?: string }>();
  let attrBuf: string[] = [];
  // Property regex (single-line auto-prop, no leading attributes)
  const propRe = /^\s*public\s+(?:virtual\s+|override\s+|new\s+)*([\w.<>?,\s\[\]]+?)\s+(\w+)\s*\{\s*get\s*;\s*(?:set\s*;\s*|init\s*;\s*)?\s*\}\s*$/;

  // Strip leading [Attr] segments off a trimmed line, accumulating them into `out`.
  // Returns the residue (e.g. "public Guid Id { get; set; }").
  const peelAttributes = (line: string, out: string[]): string => {
    let s = line;
    // Match one or more [...] groups separated by whitespace at the start.
    while (true) {
      const m = /^\s*\[([^\]]+)\]\s*/.exec(s);
      if (!m) return s;
      // Multiple attributes inside one bracket: [A, B] or [A] [B]
      // Split on commas at top level (no parens inside) for [A, B] case.
      const inner = m[1];
      const depth = { p: 0 };
      let cur = '';
      const splits: string[] = [];
      for (const ch of inner) {
        if (ch === '(') depth.p++;
        else if (ch === ')') depth.p--;
        if (ch === ',' && depth.p === 0) { splits.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      if (cur.trim()) splits.push(cur.trim());
      for (const a of splits) out.push(`[${a}]`);
      s = s.slice(m[0].length);
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) { attrBuf = []; continue; }

    // Peel leading attributes (handles `[Key]\n`, `[Key] [Required]`, `[Key] public ...` on one line).
    const collected: string[] = [];
    const residue = peelAttributes(trimmed, collected);
    attrBuf.push(...collected);

    if (!residue.trim()) {
      // Pure attribute line(s) — keep buffer, move on.
      continue;
    }

    // Try to match property in residue.
    const pm = propRe.exec(' ' + residue); // prepend space so /^\s*public/ matches
    if (pm) {
      const typeRaw = pm[1].trim();
      const name = pm[2];
      const type = parseType(typeRaw);
      const attributes = [...attrBuf];
      attrBuf = [];
      const notMapped = attributes.some(a => /^\[\s*NotMapped\b/.test(a));
      const isKey = attributes.some(a => /^\[\s*Key\b/.test(a));
      const isRequired = attributes.some(a => /^\[\s*Required\b/.test(a));
      const fkAttr = attributes.find(a => /^\[\s*ForeignKey\s*\(/.test(a));
      const fkTargetNav = fkAttr ? /\[\s*ForeignKey\s*\(\s*"([^"]+)"/.exec(fkAttr)?.[1] : undefined;
      const colAttr = attributes.find(a => /^\[\s*Column\s*\(/.test(a));
      const columnNameOverride = colAttr ? /\[\s*Column\s*\(\s*"([^"]+)"/.exec(colAttr)?.[1] : undefined;
      props.push({
        name, type, attributes, isKey, isRequired, fkTargetNav, columnNameOverride, notMapped,
      });
    } else {
      // Non-property line (method, ctor, field) — drop buffered attrs.
      if (residue.startsWith('public') || residue.startsWith('private') || residue.startsWith('protected') || residue.startsWith('internal')) {
        attrBuf = [];
      }
    }
  }
  return { properties: props, navByName: nav };
}

// ─── Resolution & assembly ───────────────────────────────────────────────────

function resolveTableName(entity: ParsedEntity, ctx: DbContextInfo | undefined): string {
  if (ctx) {
    const dbSet = ctx.dbSets.get(entity.className);
    if (dbSet) return dbSet;
    const fluentName = ctx.fluent.toTable.get(entity.className);
    if (fluentName) return fluentName;
  }
  if (entity.classTableAttr) return entity.classTableAttr;
  return entity.className;
}

function detectPk(entity: ParsedEntity, ctx: DbContextInfo | undefined): string | undefined {
  const explicit = entity.properties.find(p => p.isKey && !p.notMapped);
  if (explicit) return explicit.name;
  const fluent = ctx?.fluent.hasKey.get(entity.className);
  if (fluent && fluent.length === 1) return fluent[0];
  // Convention: Id or <ClassName>Id
  const conv = entity.properties.find(p =>
    !p.notMapped && (p.name === 'Id' || p.name === `${entity.className}Id`),
  );
  return conv?.name;
}

interface ResolvedEntity {
  parsed: ParsedEntity;
  tableName: string;
  pkPropName?: string;
}

function classifyEntities(entities: ParsedEntity[]): Set<string> {
  return new Set(entities.map(e => e.className));
}

function detectFk(
  prop: ParsedProperty,
  entity: ParsedEntity,
  resolvedByClass: Map<string, ResolvedEntity>,
  ctx: DbContextInfo | undefined,
  warn: (msg: string) => void,
): { parentClass: string } | undefined {
  // 1. [ForeignKey("Nav")] on this scalar — Nav is a navigation property name on the same entity
  if (prop.fkTargetNav) {
    const navProp = entity.properties.find(p => p.name === prop.fkTargetNav);
    if (navProp && resolvedByClass.has(navProp.type.inner)) {
      return { parentClass: navProp.type.inner };
    }
  }
  // 2. [ForeignKey("ScalarName")] on a nav prop pointing at this scalar
  for (const nav of entity.properties) {
    if (nav.fkTargetNav === prop.name && resolvedByClass.has(nav.type.inner)) {
      return { parentClass: nav.type.inner };
    }
  }
  // 3. fluent HasOne/WithMany/HasForeignKey
  if (ctx) {
    for (const link of ctx.fluent.fkChain) {
      if (link.entity !== entity.className) continue;
      if (!link.fkProps.includes(prop.name)) continue;
      const navProp = entity.properties.find(p => p.name === link.navProp);
      if (navProp && resolvedByClass.has(navProp.type.inner)) {
        return { parentClass: navProp.type.inner };
      }
    }
  }
  // 4. Convention: <NavPropName>Id matching a navigation property
  const idMatch = /^(.+)Id$/.exec(prop.name);
  if (idMatch) {
    const navName = idMatch[1];
    const navProp = entity.properties.find(p =>
      p.name === navName && resolvedByClass.has(p.type.inner) && !p.type.isCollection,
    );
    if (navProp) return { parentClass: navProp.type.inner };
    // Name matches convention but no nav prop — emit warning only if name strongly looks like FK
    // (e.g. ends with Id, length > 2). Heuristic: skip if `Id` itself.
    if (navName.length > 0) {
      warn(`Conventional FK ${entity.className}.${prop.name} has no matching navigation property; treating as plain column`);
    }
  }
  return undefined;
}

function shouldSkipAsNavigation(
  prop: ParsedProperty,
  entityClassNames: Set<string>,
): boolean {
  // Any collection property is a navigation (real columns are never collections).
  // This also covers the case where the target entity is no longer in the file set
  // (e.g. during sync when a referenced entity was removed).
  if (prop.type.isCollection) return true;
  // Single entity-typed property: always skip from column list — FK is detected on
  // the matching scalar twin via convention or [ForeignKey].
  if (entityClassNames.has(prop.type.inner)) return true;
  return false;
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function parseCsharpEf(
  files: CsharpEfFile[],
  projectName?: string,
): { project: Project; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  const dbContexts = findDbContexts(files, warn);
  const ctx = dbContexts[0];
  const dbContextNames = new Set(dbContexts.map(d => d.className));
  const entities = findEntities(files, dbContextNames);

  if (entities.length === 0) {
    throw new Error('No entity classes found in provided files');
  }
  if (!ctx) {
    warn('No DbContext class found — inferring tables from entity classes; DbSet property names unavailable');
  }

  // Resolve table names
  const resolvedByClass = new Map<string, ResolvedEntity>();
  for (const e of entities) {
    e.tableName = resolveTableName(e, ctx);
    resolvedByClass.set(e.className, { parsed: e, tableName: e.tableName });
  }
  // Detect PKs (after all entities known so FK resolution can use parent PKs)
  for (const e of entities) {
    const pk = detectPk(e, ctx);
    const r = resolvedByClass.get(e.className)!;
    r.pkPropName = pk;
    if (!pk) warn(`No primary key detected for entity ${e.className}`);
  }

  const entityClassNames = classifyEntities(entities);
  const now = new Date().toISOString();

  // Build tables
  const tables: DatasetSchema[] = entities.map(e => {
    const resolved = resolvedByClass.get(e.className)!;
    const columns: ColumnSchema[] = [];
    for (const prop of e.properties) {
      if (prop.notMapped) continue;
      if (shouldSkipAsNavigation(prop, entityClassNames)) continue;
      const ctxStr = `${e.className}.${prop.name}`;
      const dataType = mapDataType(prop.type.inner, warn, ctxStr);

      const isPk = resolved.pkPropName === prop.name;
      const fk = !isPk ? detectFk(prop, e, resolvedByClass, ctx, warn) : undefined;
      const indexType = isPk ? 'primary_key' : fk ? 'foreign_key' : 'none';

      const columnName = prop.columnNameOverride
        ?? ctx?.fluent.hasColumnName.get(e.className)?.get(prop.name)
        ?? prop.name;

      const notNull = prop.isRequired
        || (!prop.type.nullable && isValueType(prop.type.inner) && !prop.type.isCollection);

      const generatorConfig: GeneratorConfig = {};
      if (fk) {
        const parent = resolvedByClass.get(fk.parentClass)!;
        const parentCol = parent.pkPropName ?? 'id';
        if (!parent.pkPropName) {
          warn(`FK ${e.className}.${prop.name} targets ${fk.parentClass} which has no primary key (assuming 'id')`);
        }
        generatorConfig.poolRef = `${parent.tableName}.${parentCol}`;
      }

      columns.push({
        id: nanoid(),
        name: columnName,
        dataType,
        indexType,
        notNull,
        generatorConfig,
        ...(isPk ? { poolName: `${resolved.tableName}.${columnName}` } : {}),
      });
    }
    return {
      id: nanoid(),
      name: resolved.tableName,
      columns,
      rules: [],
      sourceType: 'manual' as const,
      createdAt: now,
      updatedAt: now,
    };
  });

  const project: Project = {
    id: nanoid(),
    name: projectName ?? (ctx?.className ?? 'Imported C# EF Project'),
    tables,
    createdAt: now,
    updatedAt: now,
  };
  return { project, warnings };
}
