// Mirror of backend types — kept in sync manually

export type ColumnDataType =
  | 'string' | 'integer' | 'float' | 'boolean'
  | 'date' | 'datetime' | 'uuid' | 'email' | 'phone'
  | 'url' | 'enum' | 'regex';

export type IndexType = 'primary_key' | 'unique' | 'foreign_key' | 'none';

export interface GeneratorConfig {
  min?: number; max?: number; precision?: number;
  dateFrom?: string; dateTo?: string;
  enumValues?: string[]; enumWeights?: number[];
  minLength?: number; maxLength?: number;
  pattern?: string;
  poolRef?: string;
  poolSampling?: 'uniform' | 'weighted';
  nullRate?: number;
  fakerFn?: string;
  locale?: string;
  /** Group key for coherent persona (used with `persona.*` fakerFns). */
  personaGroup?: string;
  // Advanced FK controls (Phase 3)
  fkNullRate?: number;
  fkDistribution?: 'uniform' | 'weighted' | 'fixed_per_parent';
  fkChildrenPerParent?: { min: number; max: number };
  fkValueWeights?: Array<{ value: string; weight: number }>;
  fkFixedValues?: string[];
}

export interface ColumnSchema {
  id: string;
  name: string;
  dataType: ColumnDataType;
  indexType: IndexType;
  poolName?: string;
  notNull: boolean;
  generatorConfig: GeneratorConfig;
  sampleValues?: string[];
}

export type RuleOperator = 'eq'|'neq'|'gt'|'lt'|'gte'|'lte'|'contains'|'is_null'|'is_not_null';
export type RuleAction = 'set_null'|'set_not_null'|'set_value'|'set_enum'|'set_range'|'derive_offset'|'derive_compute';

export interface RuleCondition {
  column: string;
  op: RuleOperator;
  value?: string | number | boolean;
}

export interface ConditionalRule {
  id: string;
  name?: string;
  conditions: RuleCondition[];
  actionColumn: string;
  action: RuleAction;
  actionValue?: unknown;
}

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

export interface Project {
  id: string;
  name: string;
  tables: DatasetSchema[];
  groupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FkCandidate {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  confidence: number;
  reasons: string[];
  selfReference?: boolean;
}

export interface Group {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export type GroupWithCount = Group & { projectCount: number };

export interface TableRowConfig {
  tableId: string;
  rowCount: number;
}

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled' | 'expired';
export type GeneratedRow = Record<string, string | number | boolean | null>;

export interface GenerationJob {
  id: string; schemaId?: string; rowCount?: number;
  status: JobStatus; progress: number; seed: number;
  completedRows?: number;
  errorMessage?: string;
  createdAt: string;
}

// Steps for the single-table wizard (legacy)
export type AppStep = 'import' | 'schema' | 'generate' | 'preview';

// Project editor tabs
export type ProjectTab = 'tables' | 'diagram' | 'generate' | 'export' | 'query';
