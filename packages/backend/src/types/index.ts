// ─── Column & Schema ──────────────────────────────────────────────────────────

export type ColumnDataType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'email'
  | 'phone'
  | 'url'
  | 'enum'
  | 'regex';

export type IndexType = 'primary_key' | 'unique' | 'foreign_key' | 'none';

export type PoolSampling = 'uniform' | 'weighted';

export interface GeneratorConfig {
  // numbers
  min?: number;
  max?: number;
  precision?: number;
  // dates
  dateFrom?: string;
  dateTo?: string;
  // enum
  enumValues?: string[];
  enumWeights?: number[];
  // string
  minLength?: number;
  maxLength?: number;
  // regex
  pattern?: string;
  // FK / pool (legacy)
  poolRef?: string;            // e.g. "products.id"
  poolSampling?: PoolSampling;
  // nulls
  nullRate?: number;           // 0–1, forced 0 when notNull
  // explicit Faker function override (e.g. "person.fullName", "location.city")
  fakerFn?: string;
  // locale (Faker)
  locale?: string;
  // ── Persona coherence ───────────────────────────────────────────────────────
  /**
   * Group key for coherent personas. Columns sharing the same `personaGroup`
   * pull from the same per-row persona, so name/email/phone/city all match.
   * Only effective when `fakerFn` starts with `persona.*`.
   */
  personaGroup?: string;

  // ── Advanced FK controls (Phase 3) ──────────────────────────────────────────
  /** Fraction of FK rows that will be null (0–1). Applied before pool sampling. */
  fkNullRate?: number;
  /** Distribution strategy for picking from the parent pool. */
  fkDistribution?: 'uniform' | 'weighted' | 'fixed_per_parent';
  /** For fixed_per_parent: how many child rows each parent receives (inclusive). */
  fkChildrenPerParent?: { min: number; max: number };
  /**
   * For weighted distribution only. Must be used together with fkFixedValues
   * (values must be known at design time — dynamic UUID/int pools can't carry
   * per-value weights because the values aren't known until generation time).
   */
  fkValueWeights?: Array<{ value: string; weight: number }>;
  /** Restrict the FK pool to this explicit subset of parent values. */
  fkFixedValues?: string[];
}

export interface ColumnSchema {
  id: string;
  name: string;
  dataType: ColumnDataType;
  indexType: IndexType;
  poolName?: string;           // auto-set when indexType === 'primary_key'
  notNull: boolean;
  generatorConfig: GeneratorConfig;
  sampleValues?: string[];     // from CSV inference, display only
}

// ─── Conditional Rules ────────────────────────────────────────────────────────

export type RuleOperator =
  | 'eq' | 'neq'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains'
  | 'is_null' | 'is_not_null';

export type RuleAction =
  | 'set_null'
  | 'set_not_null'
  | 'set_value'
  | 'set_enum'
  | 'set_range'
  | 'derive_offset'   // target = source_col + offset (dates/numbers)
  | 'derive_compute'; // target = expr (e.g. "quantity * unit_price")

export interface RuleCondition {
  column: string;
  op: RuleOperator;
  value?: string | number | boolean;
}

export interface ConditionalRule {
  id: string;
  name?: string;
  conditions: RuleCondition[];  // AND-joined
  actionColumn: string;
  action: RuleAction;
  actionValue?: unknown;        // depends on action type
}

// ─── Dataset Schema ───────────────────────────────────────────────────────────

export type SourceType = 'upload' | 'manual' | 'sql' | 'prisma' | 'er';

export interface DatasetSchema {
  id: string;
  name: string;
  columns: ColumnSchema[];
  rules: ConditionalRule[];
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

// ─── Project (multi-table) ────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  tables: DatasetSchema[];       // each element is one table
  groupId?: string | null;       // optional workspace/folder assignment
  createdAt: string;
  updatedAt: string;
}

// ─── Group (workspace / folder above projects) ────────────────────────────────

export interface Group {
  id: string;
  name: string;
  icon: string;                  // emoji or short icon name (e.g. "📁" or "folder")
  createdAt: string;
  updatedAt: string;
}

// ─── Generation Job ───────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled' | 'expired';

export type GeneratedRow = Record<string, string | number | boolean | null>;

export interface TableRowConfig {
  tableId: string;
  rowCount: number;
}

export interface GenerationJob {
  id: string;
  // single-table
  schemaId?: string;
  rowCount?: number;
  resultPath?: string;                        // path to JSONL temp file
  // multi-table project
  projectId?: string;
  tableConfigs?: TableRowConfig[];
  resultPaths?: Record<string, string>;       // tableId → JSONL path
  // common
  status: JobStatus;
  progress: number;                           // 0–100
  completedRows?: number;                     // for ETA display
  seed: number;
  errorMessage?: string;
  createdAt: string;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiOk<T> | ApiError;

// ─── Inference result ─────────────────────────────────────────────────────────

export interface InferredSchema {
  columns: Omit<ColumnSchema, 'id'>[];
  rowCount: number;
  warnings: string[];
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class CircularDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular FK dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CircularDependencyError';
  }
}

export class GenerationCancelledError extends Error {
  constructor() {
    super('Generation was cancelled.');
    this.name = 'GenerationCancelledError';
  }
}
