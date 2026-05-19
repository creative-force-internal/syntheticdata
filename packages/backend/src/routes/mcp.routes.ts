import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { schemaStore, jobStore, projectStore, groupStore } from '../store/session.store.js';
import { parseSQL } from '../services/sql-parser.service.js';
import { parseCsharpEf } from '../services/csharp-ef-parser.service.js';
import { inferFkCandidates } from '../services/fk-inference.service.js';
import { generateProject } from '../services/multi-generate.service.js';
import { generateRowsChunked, createStreamingContext } from '../services/streaming-generator.service.js';
import { applyRules } from '../services/rule-engine.service.js';
import { appendJsonlChunk, readJsonlRows, jobTempPath, cleanupJobFiles } from '../services/tempfile.service.js';
import { GenerationCancelledError } from '../types/index.js';
import type { DatasetSchema, GenerationJob, Group, TableRowConfig } from '../types/index.js';

// ─── In-memory cancellation tokens (lost on restart, intentionally) ───────────

const cancellationTokens = new Map<string, { cancelled: boolean }>();

// ─── Session store: sessionId → transport ─────────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

// ─── Tool registration ────────────────────────────────────────────────────────

// Shared column input shape — reused by tools that accept column definitions.
const columnInputZ = z.object({
  name: z.string().min(1).describe('Column name'),
  dataType: z.enum(['string','integer','float','boolean','date','datetime','uuid','email','phone','url','enum','regex'])
    .describe('Data type'),
  indexType: z.enum(['primary_key','unique','foreign_key','none']).default('none').describe('Index type'),
  notNull: z.boolean().default(false).describe('Whether the column is NOT NULL'),
  generatorConfig: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    enumValues: z.array(z.string()).optional().describe('Values for enum type'),
    nullRate: z.number().min(0).max(1).optional().describe('Fraction of rows that should be NULL (0–1)'),
    fakerFn: z.string().optional().describe('Faker function e.g. "person.fullName", "location.city"'),
    locale: z.enum(['en_US','ja','vi','de','da','fr','es']).optional(),
    poolRef: z.string().optional().describe('FK reference e.g. "users.id"'),
  }).optional().describe('Generator configuration'),
});

type ColumnInput = z.infer<typeof columnInputZ>;

// Shared C# EF file input shape for infer / sync tools.
const csharpFileZ = z.object({
  filename: z.string().min(1).describe('Original filename, e.g. "AppDbContext.cs" or "User.cs"'),
  content:  z.string().min(1).describe('Raw C# source code'),
});
const csharpFilesZ = z.array(csharpFileZ).min(1)
  .describe('C# source files: typically one DbContext file plus one file per entity class.');

function materializeColumns(tableName: string, cols: ColumnInput[]) {
  return cols.map(c => ({
    id: nanoid(),
    name: c.name,
    dataType: c.dataType,
    indexType: c.indexType ?? 'none',
    notNull: c.notNull ?? false,
    generatorConfig: c.generatorConfig ?? {},
    poolName: c.indexType === 'primary_key' ? `${tableName}.${c.name}` : undefined,
  }));
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'synthetic-data', version: '1.0.0' });

  // ── list_schemas ────────────────────────────────────────────────────────────
  server.tool(
    'list_schemas',
    'List all saved single-table schemas. Returns id, name, column count, and createdAt for each.',
    {},
    async () => {
      const schemas = schemaStore.list().map(s => ({
        id: s.id,
        name: s.name,
        columns: s.columns.length,
        sourceType: s.sourceType,
        createdAt: s.createdAt,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(schemas, null, 2) }] };
    },
  );

  // ── create_schema ───────────────────────────────────────────────────────────
  server.tool(
    'create_schema',
    'Create a new single-table schema with column definitions. Returns the saved schema id.',
    {
      name: z.string().min(1).describe('Table name'),
      columns: z.array(z.object({
        name: z.string().min(1).describe('Column name'),
        dataType: z.enum(['string','integer','float','boolean','date','datetime','uuid','email','phone','url','enum','regex'])
          .describe('Data type'),
        indexType: z.enum(['primary_key','unique','foreign_key','none']).default('none')
          .describe('Index type'),
        notNull: z.boolean().default(false).describe('Whether the column is NOT NULL'),
        generatorConfig: z.object({
          min: z.number().optional(),
          max: z.number().optional(),
          enumValues: z.array(z.string()).optional().describe('Values for enum type'),
          nullRate: z.number().min(0).max(1).optional().describe('Fraction of rows that should be NULL (0–1)'),
          fakerFn: z.string().optional().describe('Faker function e.g. "person.fullName", "location.city"'),
          locale: z.enum(['en_US','ja','vi','de','da','fr','es']).optional(),
          poolRef: z.string().optional().describe('FK reference e.g. "users.id"'),
        }).optional().describe('Generator configuration'),
      })).min(1).describe('Column definitions'),
    },
    async ({ name, columns }) => {
      const now = new Date().toISOString();
      const schema: DatasetSchema = {
        id: nanoid(),
        name,
        columns: columns.map(c => ({
          id: nanoid(),
          name: c.name,
          dataType: c.dataType,
          indexType: c.indexType ?? 'none',
          notNull: c.notNull ?? false,
          generatorConfig: c.generatorConfig ?? {},
          poolName: c.indexType === 'primary_key' ? `${name}.${c.name}` : undefined,
        })),
        rules: [],
        sourceType: 'manual',
        createdAt: now,
        updatedAt: now,
      };
      schemaStore.set(schema);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ schemaId: schema.id, name: schema.name }) }] };
    },
  );

  // ── infer_schema_from_sql ───────────────────────────────────────────────────
  server.tool(
    'infer_schema_from_sql',
    'Parse a SQL CREATE TABLE statement into a schema and save it. Returns the schema id.',
    {
      ddl: z.string().min(1).describe('SQL CREATE TABLE statement'),
    },
    async ({ ddl }) => {
      let result: ReturnType<typeof parseSQL>;
      try {
        result = parseSQL(ddl);
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error parsing SQL: ${(e as Error).message}` }], isError: true };
      }
      const now = new Date().toISOString();
      const schema: DatasetSchema = {
        id: nanoid(),
        name: result.tableName,
        columns: result.columns.map(c => ({ id: nanoid(), ...c })),
        rules: [],
        sourceType: 'sql',
        createdAt: now,
        updatedAt: now,
      };
      schemaStore.set(schema);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            schemaId: schema.id,
            name: schema.name,
            columnCount: schema.columns.length,
            warnings: result.warnings,
          }, null, 2),
        }],
      };
    },
  );

  // ── start_generation ────────────────────────────────────────────────────────
  server.tool(
    'start_generation',
    'Start an async data generation job for a single-table schema. Returns jobId and seed. Poll get_job_status until status is "done".',
    {
      schemaId: z.string().min(1).describe('Schema ID from list_schemas or create_schema'),
      rowCount: z.number().int().min(1).max(10_000_000).default(100).describe('Number of rows to generate'),
      seed: z.number().int().optional().describe('Random seed for reproducibility. Omit for random.'),
    },
    async ({ schemaId, rowCount, seed }) => {
      const schema = schemaStore.get(schemaId);
      if (!schema) {
        return { content: [{ type: 'text' as const, text: `Schema not found: ${schemaId}` }], isError: true };
      }
      const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
      const resultPath = jobTempPath(nanoid());

      const job: GenerationJob = {
        id: nanoid(),
        schemaId,
        rowCount,
        status: 'pending',
        progress: 0,
        completedRows: 0,
        seed: resolvedSeed,
        resultPath,
        createdAt: new Date().toISOString(),
      };
      jobStore.set(job);

      const token = { cancelled: false };
      cancellationTokens.set(job.id, token);

      setImmediate(async () => {
        jobStore.update(job.id, { status: 'running', progress: 5 });
        try {
          const ctx = createStreamingContext();
          let firstChunk = true;
          await generateRowsChunked(
            schema.columns, rowCount, resolvedSeed, ctx,
            async (rows, completedRows) => {
              const processed = applyRules(rows, schema.rules);
              if (firstChunk) {
                const fs = await import('fs');
                try { fs.unlinkSync(resultPath); } catch { /* ok */ }
                firstChunk = false;
              }
              await appendJsonlChunk(resultPath, processed);
              const progress = Math.min(95, Math.floor((completedRows / rowCount) * 95));
              jobStore.update(job.id, { progress, completedRows });
            },
            token,
          );
          jobStore.update(job.id, { status: 'done', progress: 100, completedRows: rowCount });
        } catch (e) {
          if (e instanceof GenerationCancelledError) {
            jobStore.update(job.id, { status: 'cancelled' });
            cleanupJobFiles(job.id);
          } else {
            jobStore.update(job.id, { status: 'error', errorMessage: (e as Error).message });
          }
        } finally {
          cancellationTokens.delete(job.id);
        }
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ jobId: job.id, seed: resolvedSeed, rowCount }),
        }],
      };
    },
  );

  // ── get_job_status ──────────────────────────────────────────────────────────
  server.tool(
    'get_job_status',
    'Poll the status of a generation job. Status values: pending | running | done | error | cancelled | expired.',
    {
      jobId: z.string().min(1).describe('Job ID from start_generation or start_project_generation'),
    },
    async ({ jobId }) => {
      const job = jobStore.get(jobId);
      if (!job) {
        return { content: [{ type: 'text' as const, text: `Job not found: ${jobId}` }], isError: true };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            jobId: job.id,
            status: job.status,
            progress: job.progress,
            completedRows: job.completedRows ?? 0,
            rowCount: job.rowCount,
            seed: job.seed,
            errorMessage: job.errorMessage,
          }),
        }],
      };
    },
  );

  // ── preview_rows ────────────────────────────────────────────────────────────
  server.tool(
    'preview_rows',
    'Preview the first N generated rows from a completed job (max 50).',
    {
      jobId: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(10).describe('Number of rows to preview'),
    },
    async ({ jobId, limit }) => {
      const job = jobStore.get(jobId);
      if (!job) {
        return { content: [{ type: 'text' as const, text: `Job not found: ${jobId}` }], isError: true };
      }
      if (job.status !== 'done') {
        return { content: [{ type: 'text' as const, text: `Job is not done yet (status: ${job.status})` }], isError: true };
      }
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath) {
        return { content: [{ type: 'text' as const, text: 'Result file not found' }], isError: true };
      }
      const rows = await readJsonlRows(resultPath, limit);
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );

  // ── get_export_url ──────────────────────────────────────────────────────────
  server.tool(
    'get_export_url',
    'Get the download URL for a completed single-table generation job.',
    {
      jobId: z.string().min(1),
      format: z.enum(['csv','json','jsonl','sql']).default('csv').describe('Export format'),
    },
    async ({ jobId, format }) => {
      const job = jobStore.get(jobId);
      if (!job) {
        return { content: [{ type: 'text' as const, text: `Job not found: ${jobId}` }], isError: true };
      }
      if (job.status !== 'done') {
        return { content: [{ type: 'text' as const, text: `Job is not done yet (status: ${job.status})` }], isError: true };
      }
      const baseUrl = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
      const url = `${baseUrl}/api/v1/export/${jobId}/${format}`;
      return { content: [{ type: 'text' as const, text: JSON.stringify({ url, format, jobId }) }] };
    },
  );

  // ── list_projects ───────────────────────────────────────────────────────────
  server.tool(
    'list_projects',
    'List all multi-table projects. Returns id, name, table count, and createdAt.',
    {},
    async () => {
      const projects = projectStore.list().map(p => ({
        id: p.id,
        name: p.name,
        tables: p.tables.map(t => ({ id: t.id, name: t.name, columns: t.columns.length })),
        createdAt: p.createdAt,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(projects, null, 2) }] };
    },
  );

  // ── get_project ─────────────────────────────────────────────────────────────
  server.tool(
    'get_project',
    'Get full details of a project including all tables and their columns. Use this before update_project_table to see current column shape.',
    {
      projectId: z.string().min(1).describe('Project ID from list_projects'),
    },
    async ({ projectId }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(project, null, 2) }] };
    },
  );

  // ── add_project_table ───────────────────────────────────────────────────────
  server.tool(
    'add_project_table',
    'Add a new table to an existing multi-table project. Returns the new tableId.',
    {
      projectId: z.string().min(1).describe('Project ID'),
      name: z.string().min(1).describe('Table name (must be unique within the project)'),
      columns: z.array(columnInputZ).min(1).describe('Column definitions'),
    },
    async ({ projectId, name, columns }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      if (project.tables.some(t => t.name === name)) {
        return { content: [{ type: 'text' as const, text: `Table name already exists in project: ${name}` }], isError: true };
      }
      const now = new Date().toISOString();
      const newTable: DatasetSchema = {
        id: nanoid(),
        name,
        columns: materializeColumns(name, columns),
        rules: [],
        sourceType: 'manual',
        createdAt: now,
        updatedAt: now,
      };
      project.tables.push(newTable);
      project.updatedAt = now;
      projectStore.set(project);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tableId: newTable.id, name: newTable.name }) }] };
    },
  );

  // ── update_project_table ────────────────────────────────────────────────────
  server.tool(
    'update_project_table',
    'Replace a table within a project. Provide the FULL new column list — this is a replace, not a patch. Column IDs are regenerated, so other tables referencing this table via poolRef should still work because poolRef matches by table.column NAME, not ID.',
    {
      projectId: z.string().min(1).describe('Project ID'),
      tableId: z.string().min(1).describe('Table ID from get_project'),
      name: z.string().min(1).optional().describe('New table name. Omit to keep current name.'),
      columns: z.array(columnInputZ).min(1).describe('Full new column list (replaces existing columns)'),
    },
    async ({ projectId, tableId, name, columns }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      const idx = project.tables.findIndex(t => t.id === tableId);
      if (idx < 0) {
        return { content: [{ type: 'text' as const, text: `Table not found in project: ${tableId}` }], isError: true };
      }
      const existing = project.tables[idx];
      const finalName = name ?? existing.name;
      if (name && name !== existing.name && project.tables.some(t => t.id !== tableId && t.name === name)) {
        return { content: [{ type: 'text' as const, text: `Another table already uses name: ${name}` }], isError: true };
      }
      const now = new Date().toISOString();
      project.tables[idx] = {
        ...existing,
        name: finalName,
        columns: materializeColumns(finalName, columns),
        updatedAt: now,
      };
      project.updatedAt = now;
      projectStore.set(project);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tableId, name: finalName, columns: project.tables[idx].columns.length }) }] };
    },
  );

  // ── remove_project_table ────────────────────────────────────────────────────
  server.tool(
    'remove_project_table',
    'Remove a table from a project. Caller is responsible for FK cleanup — other tables referencing this one via poolRef will fail at generation time.',
    {
      projectId: z.string().min(1).describe('Project ID'),
      tableId: z.string().min(1).describe('Table ID to remove'),
    },
    async ({ projectId, tableId }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      const before = project.tables.length;
      project.tables = project.tables.filter(t => t.id !== tableId);
      if (project.tables.length === before) {
        return { content: [{ type: 'text' as const, text: `Table not found in project: ${tableId}` }], isError: true };
      }
      project.updatedAt = new Date().toISOString();
      projectStore.set(project);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ removed: tableId, remaining: project.tables.length }) }] };
    },
  );

  // ── infer_project_from_csharp_ef ───────────────────────────────────────────
  server.tool(
    'infer_project_from_csharp_ef',
    'Import a C# Entity Framework Core schema as a NEW multi-table project. Accepts the DbContext file and entity class files (paste raw .cs source). Use when the user provides EF Core code, mentions DbContext, DbSet<>, [ForeignKey], OnModelCreating, or asks to import from EF Core / Entity Framework / .NET. Optionally place the new project into a folder/group via groupId — call list_groups first to see available folders, or ask the user which folder to use. Returns the new projectId.',
    {
      name: z.string().min(1).describe('Project name (e.g. the DbContext class name or a friendly label)'),
      files: csharpFilesZ,
      groupId: z.string().nullable().optional().describe('Optional folder/group ID to place the new project into. Omit or pass null for Uncategorized. Use list_groups to discover IDs.'),
    },
    async ({ name, files, groupId }) => {
      if (groupId != null && !groupStore.get(groupId)) {
        return { content: [{ type: 'text' as const, text: `Group not found: ${groupId}. Call list_groups to see available folders.` }], isError: true };
      }
      try {
        const { project, warnings } = parseCsharpEf(files, name);
        if (groupId != null) project.groupId = groupId;
        projectStore.set(project);
        // EF convention-based FKs often slip through ([ForeignKey]-less columns
        // named UserId etc). Run inference on the parsed tables and surface
        // any extra candidates the EF parser didn't materialise.
        const fkCandidates = inferFkCandidates(
          project.tables.map(t => ({ tableName: t.name, columns: t.columns })),
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              projectId: project.id,
              name: project.name,
              tableCount: project.tables.length,
              groupId: project.groupId ?? null,
              warnings,
              ...(fkCandidates.length > 0 ? { fkCandidates } : {}),
            }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `C# parse error: ${(e as Error).message}` }], isError: true };
      }
    },
  );

  // ── sync_project_from_csharp_ef ────────────────────────────────────────────
  server.tool(
    'sync_project_from_csharp_ef',
    'STRICT mirror an existing project\'s tables from updated C# Entity Framework Core source. Drops project tables not present in the C# source, adds new tables, and replaces columns of matched tables. One-way C# → project. Use after a previous infer_project_from_csharp_ef when the source has changed. Returns added/removed/updated table names.',
    {
      projectId: z.string().min(1).describe('Existing project ID (from infer_project_from_csharp_ef or list_projects)'),
      files: csharpFilesZ,
    },
    async ({ projectId, files }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      let parsed;
      try {
        parsed = parseCsharpEf(files, project.name);
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `C# parse error: ${(e as Error).message}` }], isError: true };
      }
      const oldNames = new Set(project.tables.map(t => t.name));
      const newNames = new Set(parsed.project.tables.map(t => t.name));
      const addedTables = [...newNames].filter(n => !oldNames.has(n));
      const removedTables = [...oldNames].filter(n => !newNames.has(n));
      const updatedTables = [...newNames].filter(n => oldNames.has(n));
      project.tables = parsed.project.tables;
      project.updatedAt = new Date().toISOString();
      projectStore.set(project);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            projectId: project.id,
            addedTables,
            removedTables,
            updatedTables,
            warnings: parsed.warnings,
          }, null, 2),
        }],
      };
    },
  );

  // ── list_groups ────────────────────────────────────────────────────────────
  server.tool(
    'list_groups',
    'List all groups (workspaces/folders) that organize projects. Returns id, name, icon, createdAt, and projectCount for each. Call this BEFORE infer_project_from_csharp_ef or move_project_to_group so you can pick the right group ID — projects without a group land in the Uncategorized bucket. If the user mentions a folder/workspace by name, list_groups first and match by name to find its id.',
    {},
    async () => {
      const groups = groupStore.list();
      const projects = projectStore.list();
      const counts = new Map<string, number>();
      for (const p of projects) {
        if (p.groupId) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
      }
      const data = groups.map(g => ({
        id: g.id, name: g.name, icon: g.icon,
        createdAt: g.createdAt,
        projectCount: counts.get(g.id) ?? 0,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── create_group ───────────────────────────────────────────────────────────
  server.tool(
    'create_group',
    'Create a new group (workspace/folder) for organizing projects. Returns the new groupId. Use when the user asks to create a workspace, folder, category, or container for projects.',
    {
      name: z.string().min(1).max(100).describe('Group display name'),
      icon: z.string().min(1).max(50).describe('Emoji like "📁" or a short icon name like "folder"'),
    },
    async ({ name, icon }) => {
      const now = new Date().toISOString();
      const group: Group = { id: nanoid(), name, icon, createdAt: now, updatedAt: now };
      groupStore.set(group);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ groupId: group.id, name: group.name, icon: group.icon }) }] };
    },
  );

  // ── rename_group ───────────────────────────────────────────────────────────
  server.tool(
    'rename_group',
    'Update a group\'s name and/or icon. At least one of name or icon must be provided.',
    {
      groupId: z.string().min(1).describe('Group ID from list_groups'),
      name: z.string().min(1).max(100).optional().describe('New name (optional)'),
      icon: z.string().min(1).max(50).optional().describe('New icon (optional)'),
    },
    async ({ groupId, name, icon }) => {
      const existing = groupStore.get(groupId);
      if (!existing) {
        return { content: [{ type: 'text' as const, text: `Group not found: ${groupId}` }], isError: true };
      }
      if (name === undefined && icon === undefined) {
        return { content: [{ type: 'text' as const, text: 'At least one of name or icon is required' }], isError: true };
      }
      const updated: Group = {
        ...existing,
        name: name ?? existing.name,
        icon: icon ?? existing.icon,
        updatedAt: new Date().toISOString(),
      };
      groupStore.set(updated);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ groupId: updated.id, name: updated.name, icon: updated.icon }) }] };
    },
  );

  // ── delete_group ───────────────────────────────────────────────────────────
  server.tool(
    'delete_group',
    'Delete a group. All projects in the group are reassigned to Uncategorized (groupId=null) — they are NOT deleted. Returns the number of projects reassigned.',
    {
      groupId: z.string().min(1).describe('Group ID to delete'),
    },
    async ({ groupId }) => {
      if (!groupStore.get(groupId)) {
        return { content: [{ type: 'text' as const, text: `Group not found: ${groupId}` }], isError: true };
      }
      const reassigned = groupStore.deleteAndReassign(groupId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: groupId, reassignedProjects: reassigned }) }] };
    },
  );

  // ── move_project_to_group ──────────────────────────────────────────────────
  server.tool(
    'move_project_to_group',
    'Move a project into a group, or remove it from its current group (set groupId=null for Uncategorized).',
    {
      projectId: z.string().min(1).describe('Project ID'),
      groupId: z.string().nullable().describe('Target group ID, or null to move to Uncategorized'),
    },
    async ({ projectId, groupId }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }
      if (groupId !== null && !groupStore.get(groupId)) {
        return { content: [{ type: 'text' as const, text: `Group not found: ${groupId}` }], isError: true };
      }
      project.groupId = groupId;
      project.updatedAt = new Date().toISOString();
      projectStore.set(project);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ projectId, groupId }) }] };
    },
  );

  // ── start_project_generation ────────────────────────────────────────────────
  server.tool(
    'start_project_generation',
    'Start an async generation job for a multi-table project respecting FK constraints. Returns jobId.',
    {
      projectId: z.string().min(1).describe('Project ID from list_projects'),
      tableConfigs: z.array(z.object({
        tableId: z.string().min(1),
        rowCount: z.number().int().min(1).max(10_000_000),
      })).min(1).describe('Per-table row counts'),
      seed: z.number().int().optional().describe('Random seed. Omit for random.'),
    },
    async ({ projectId, tableConfigs, seed }) => {
      const project = projectStore.get(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found: ${projectId}` }], isError: true };
      }

      const projectTableIds = new Set(project.tables.map(t => t.id));
      const unknown = tableConfigs.find(tc => !projectTableIds.has(tc.tableId));
      if (unknown) {
        return { content: [{ type: 'text' as const, text: `Unknown tableId: ${unknown.tableId}` }], isError: true };
      }

      const resolvedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
      const jobId = nanoid();
      const now = new Date().toISOString();

      const resultPaths: Record<string, string> = {};
      for (const tc of tableConfigs) {
        resultPaths[tc.tableId] = jobTempPath(`${jobId}_${tc.tableId}`);
      }

      const job: GenerationJob = {
        id: jobId,
        projectId,
        tableConfigs: tableConfigs as TableRowConfig[],
        status: 'pending',
        progress: 0,
        completedRows: 0,
        seed: resolvedSeed,
        resultPaths,
        createdAt: now,
      };
      jobStore.set(job);

      const token = { cancelled: false };
      cancellationTokens.set(jobId, token);
      const totalRows = tableConfigs.reduce((s, c) => s + c.rowCount, 0);

      setImmediate(async () => {
        jobStore.update(jobId, { status: 'running', progress: 5 });
        let allCompletedRows = 0;
        try {
          await generateProject(
            project.tables,
            tableConfigs as TableRowConfig[],
            resolvedSeed,
            async (tableId, rows) => {
              await appendJsonlChunk(resultPaths[tableId], rows);
              allCompletedRows += rows.length;
              const progress = Math.min(95, Math.floor((allCompletedRows / totalRows) * 95));
              jobStore.update(jobId, { progress, completedRows: allCompletedRows });
            },
            token,
          );
          jobStore.update(jobId, { status: 'done', progress: 100, completedRows: totalRows });
        } catch (e) {
          if (e instanceof GenerationCancelledError) {
            jobStore.update(jobId, { status: 'cancelled' });
          } else {
            jobStore.update(jobId, { status: 'error', errorMessage: (e as Error).message });
          }
        } finally {
          cancellationTokens.delete(jobId);
        }
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ jobId, seed: resolvedSeed, totalRows }),
        }],
      };
    },
  );

  // ─── Prompts (slash commands in MCP clients) ──────────────────────────────
  // In Claude Code these appear as `/mcp__synthetic-data__<name>`; other MCP
  // clients (Cursor, Cline, Continue, Claude Desktop) surface them similarly.
  // Equivalent native Claude Code commands also live in .claude/commands/.

  server.registerPrompt(
    'list_projects',
    { description: 'Show all projects grouped by folder, as a markdown table.' },
    () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'Call the list_groups and list_projects tools on the synthetic-data MCP server. '
              + 'Render a markdown table: Folder | Project | Tables | Updated. '
              + 'Sort by folder name (Uncategorized last), then project name. '
              + 'ISO date format. Output ONLY the table.',
        },
      }],
    }),
  );

  server.registerPrompt(
    'import_ef',
    {
      description: 'Import a C# EF Core DbContext directory as a new project.',
      argsSchema: {
        path:   z.string().describe('Path to directory containing DbContext + entity .cs files'),
        folder: z.string().optional().describe('Folder name to place project into. Created if missing.'),
      },
    },
    ({ path, folder }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Import C# EF schema at "${path}":`,
            `1. Glob *.cs at top level of "${path}" (skip Custom/, Enums/, QueryModel/). Read each. Build files[]={filename,content}.`,
            '2. Identify DbContext class (filename ends "Context.cs"). Use class name as project name.',
            folder
              ? `3. Call list_groups. Match "${folder}" case-insensitively. If missing, create_group({name:"${folder}",icon:"📦"}).`
              : '3. groupId = null (Uncategorized).',
            `4. Call infer_project_from_csharp_ef({name, files, groupId${folder ? '' : ': null'}}).`,
            '5. Report tableCount, FK count, first 5 warnings.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.registerPrompt(
    'move_project',
    {
      description: 'Move a project to a folder, matching both by name. Creates folder if missing.',
      argsSchema: {
        project: z.string().describe('Project name (case-insensitive)'),
        folder:  z.string().describe('Folder name (case-insensitive). Created with icon 📁 if missing.'),
      },
    },
    ({ project, folder }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Move project "${project}" into folder "${folder}":`,
            `1. list_projects → find match by name "${project}" (case-insensitive). If 0 match: error. If >1: list candidates and ask user.`,
            `2. list_groups → find match by name "${folder}".`,
            `3. If missing: create_group({name:"${folder}",icon:"📁"}).`,
            '4. move_project_to_group({projectId, groupId}).',
            '5. Confirm: "Moved <projectName> -> <folderName>".',
          ].join('\n'),
        },
      }],
    }),
  );

  return server;
}

// ─── CORS helper ─────────────────────────────────────────────────────────────

function setCorsHeaders(req: { headers: Record<string, string | string[] | undefined> }, raw: import('http').ServerResponse) {
  const origin = (req.headers['origin'] as string | undefined) ?? '*';
  raw.setHeader('Access-Control-Allow-Origin', origin);
  raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  raw.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
  raw.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

// ─── Fastify plugin ───────────────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {

  // OPTIONS /mcp — CORS preflight
  app.options('/mcp', async (req, reply) => {
    setCorsHeaders(req, reply.raw);
    return reply.code(204).send();
  });

  // POST /mcp — new session initialization or existing session message
  app.post('/mcp', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      // Reject unknown session IDs (don't silently create a new session for them)
      if (sessionId) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // New session — create McpServer + transport pair
      const mcpServer = buildMcpServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => { transports.set(sid, transport!); },
        onsessionclosed: (sid) => { transports.delete(sid); },
      });
      await mcpServer.connect(transport);
    }

    setCorsHeaders(req, reply.raw);
    await transport.handleRequest(req.raw, reply.raw, req.body);
    reply.hijack();
  });

  // GET /mcp — SSE stream for server-to-client notifications
  app.get('/mcp', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      return reply.code(400).send({ error: 'Valid Mcp-Session-Id header required' });
    }
    setCorsHeaders(req, reply.raw);
    await transports.get(sessionId)!.handleRequest(req.raw, reply.raw);
    reply.hijack();
  });

  // DELETE /mcp — client terminates session
  app.delete('/mcp', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.close();
        transports.delete(sessionId);
      }
    }
    return { ok: true };
  });
}
