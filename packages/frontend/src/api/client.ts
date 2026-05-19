import axios from 'axios';
import type { ColumnSchema, DatasetSchema, FkCandidate, GeneratedRow, Group, GroupWithCount, Project, TableRowConfig } from '../types/index.js';

const api = axios.create({ baseURL: '/api/v1' });

export interface InferredResult {
  columns: Omit<ColumnSchema, 'id'>[];
  rowCount: number;
  warnings: string[];
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export async function inferFromCsv(file: File): Promise<InferredResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ ok: true; data: InferredResult }>('/schemas/infer/csv', form);
  return data.data;
}

export async function inferFromSql(ddl: string): Promise<{ columns: Omit<ColumnSchema, 'id'>[]; tableName: string; warnings: string[] }> {
  const { data } = await api.post('/schemas/infer/sql', { ddl });
  return data.data;
}

export async function saveSchema(schema: Omit<DatasetSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatasetSchema> {
  const { data } = await api.post<{ ok: true; data: DatasetSchema }>('/schemas', schema);
  return data.data;
}

export async function updateSchema(id: string, schema: Omit<DatasetSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatasetSchema> {
  const { data } = await api.put<{ ok: true; data: DatasetSchema }>(`/schemas/${id}`, schema);
  return data.data;
}

export async function listSchemas(): Promise<DatasetSchema[]> {
  const { data } = await api.get<{ ok: true; data: DatasetSchema[] }>('/schemas');
  return data.data;
}

export async function listPools(): Promise<{ poolName: string; schemaId: string; schemaName: string }[]> {
  const { data } = await api.get<{ ok: true; data: { poolName: string; schemaId: string; schemaName: string }[] }>('/pools');
  return data.data;
}

// ─── Generation ───────────────────────────────────────────────────────────────

export async function startGeneration(schemaId: string, rowCount: number, seed?: number): Promise<{ jobId: string; seed: number }> {
  const { data } = await api.post<{ ok: true; data: { jobId: string; seed: number } }>('/generate', { schemaId, rowCount, seed });
  return data.data;
}

export async function pollJobStatus(jobId: string): Promise<{
  status: string; progress: number; completedRows: number; rowCount?: number; errorMessage?: string;
}> {
  const { data } = await api.get(`/generate/${jobId}/status`);
  return data.data;
}

export async function pollProjectJobStatus(jobId: string): Promise<{
  status: string; progress: number; completedRows: number; totalRows: number; errorMessage?: string;
}> {
  const { data } = await api.get(`/generate/project/${jobId}/status`);
  return data.data;
}

export async function cancelJob(jobId: string): Promise<void> {
  await api.delete(`/generate/${jobId}`);
}

export async function cancelProjectJob(jobId: string): Promise<void> {
  await api.delete(`/generate/project/${jobId}`);
}

export async function getPreview(jobId: string, rows = 20): Promise<GeneratedRow[]> {
  const { data } = await api.get(`/generate/${jobId}/preview?rows=${rows}`);
  return data.data;
}

// ─── Export download helpers ──────────────────────────────────────────────────

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get<{ ok: true; data: Project[] }>('/projects');
  return data.data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<{ ok: true; data: Project }>(`/projects/${id}`);
  return data.data;
}

export async function createProject(name: string, tables: DatasetSchema[], groupId?: string | null): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects', { name, tables, groupId });
  return data.data;
}

export async function updateProject(id: string, name: string, tables: DatasetSchema[], groupId?: string | null): Promise<Project> {
  const body: Record<string, unknown> = { name, tables };
  if (groupId !== undefined) body.groupId = groupId;
  const { data } = await api.put<{ ok: true; data: Project }>(`/projects/${id}`, body);
  return data.data;
}

/** Move a project to a different group (or null = Uncategorized). Fetches first to preserve tables. */
export async function moveProjectToGroup(id: string, groupId: string | null): Promise<Project> {
  const existing = await getProject(id);
  return updateProject(id, existing.name, existing.tables, groupId);
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export async function duplicateProject(id: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>(`/projects/${id}/duplicate`);
  return data.data;
}

export async function renameProject(id: string, name: string, tables: DatasetSchema[]): Promise<Project> {
  return updateProject(id, name, tables);
}

export async function inferFromPrisma(source: string, name?: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects/infer/prisma', { source, name });
  return data.data;
}

export async function inferProjectFromSql(sql: string, name?: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects/infer/sql', { sql, name });
  return data.data;
}

/** Parse SQL + run FK inference without persisting. Used by the review-modal import flow. */
export async function previewProjectFromSql(
  sql: string,
  name?: string,
): Promise<{ projectName: string; tables: DatasetSchema[]; warnings: string[]; fkCandidates: FkCandidate[] }> {
  const { data } = await api.post<{
    ok: true;
    data: { projectName: string; tables: DatasetSchema[]; warnings: string[]; fkCandidates: FkCandidate[] };
  }>('/projects/preview/sql', { sql, name });
  return data.data;
}

export async function inferProjectFromEr(source: string, name?: string): Promise<{ project: Project; warnings: string[] }> {
  const { data } = await api.post<{ ok: true; data: Project; warnings?: string[] }>(
    '/projects/infer/er',
    { source, name },
  );
  return { project: data.data, warnings: data.warnings ?? [] };
}

export async function startProjectGeneration(
  projectId: string,
  tableConfigs: TableRowConfig[],
  seed?: number,
): Promise<{ jobId: string; seed: number }> {
  const { data } = await api.post<{ ok: true; data: { jobId: string; seed: number } }>(
    '/generate/project',
    { projectId, tableConfigs, seed },
  );
  return data.data;
}

export async function getProjectPreview(jobId: string, rows = 20): Promise<Record<string, GeneratedRow[]>> {
  const { data } = await api.get(`/generate/project/${jobId}/preview?rows=${rows}`);
  return data.data;
}

export function projectZipUrl(jobId: string, format: 'csv' | 'json' | 'sql'): string {
  return `/api/v1/export/project/${jobId}/zip?format=${format}`;
}

export function projectSqliteUrl(jobId: string): string {
  return `/api/v1/export/project/${jobId}/sqlite`;
}

export async function queryProjectData(
  jobId: string,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const { data } = await api.post<{ ok: true; data: { rows: Record<string, unknown>[]; columns: string[] } }>(
    `/query/project/${jobId}`,
    { sql },
  );
  return data.data;
}

// ─── Live sample ──────────────────────────────────────────────────────────────

export async function sampleColumnValue(column: ColumnSchema, seed?: number): Promise<string | number | boolean | null> {
  const { data } = await api.post<{ ok: true; data: { value: string | number | boolean | null } }>('/sample', { column, seed });
  return data.data.value;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  tableCount: number;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data } = await api.get<{ ok: true; data: TemplateSummary[] }>('/templates');
  return data.data;
}

export async function createFromTemplate(templateId: string, projectName: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects/from-template', { templateId, projectName });
  return data.data;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  totalJobsCompleted: number;
  totalRowsGenerated: number;
  lastActivity: string | null;
}> {
  const { data } = await api.get<{ ok: true; data: { totalJobsCompleted: number; totalRowsGenerated: number; lastActivity: string | null } }>('/stats');
  return data.data;
}

// ─── Groups (workspace / folder) ──────────────────────────────────────────────

export async function listGroups(): Promise<GroupWithCount[]> {
  const { data } = await api.get<{ ok: true; data: GroupWithCount[] }>('/groups');
  return data.data;
}

export async function createGroup(name: string, icon: string): Promise<Group> {
  const { data } = await api.post<{ ok: true; data: Group }>('/groups', { name, icon });
  return data.data;
}

export async function updateGroup(id: string, patch: { name?: string; icon?: string }): Promise<Group> {
  const { data } = await api.put<{ ok: true; data: Group }>(`/groups/${id}`, patch);
  return data.data;
}

export async function deleteGroup(id: string): Promise<{ deleted: string; reassignedProjects: number }> {
  const { data } = await api.delete<{ ok: true; data: { deleted: string; reassignedProjects: number } }>(`/groups/${id}`);
  return data.data;
}

// ─── Export download helpers ──────────────────────────────────────────────────

export function exportUrl(jobId: string, format: 'csv' | 'json' | 'sql', opts?: { table?: string; pretty?: boolean; header?: boolean }): string {
  const params = new URLSearchParams();
  if (opts?.table) params.set('table', opts.table);
  if (opts?.pretty) params.set('pretty', 'true');
  if (opts?.header === false) params.set('header', 'false');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return `/api/v1/export/${jobId}/${format}${qs}`;
}
