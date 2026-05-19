# Synthetic Data Generator

A full-stack web application for generating realistic synthetic data from SQL DDL, Prisma schemas, or CSV uploads. Define your tables, configure column generators, and export production-like datasets in seconds — no LLM, no API key, runs entirely offline.

## Features

### Schema & Import
- **Multi-format import** — SQL DDL, Prisma schema files, or CSV uploads with automatic type inference
- **Visual schema editor** — Configure data generators per column with a rich UI (30+ Faker locales)
- **Relationship awareness** — Topological sort respects foreign key constraints; parent rows generate before children
- **Conditional rules** — Set values based on other column values (eq/neq/gt/lt/contains, AND-joined)
- **Single-table wizard** — Step-by-step flow (Import → Schema → Generate → Preview) for quick one-off datasets
- **Multi-table projects** — Manage related tables in a single project with a React Flow diagram view

### Generation & Export
- **Streaming generation** — 10k-row chunks bound memory; cancellable jobs with live progress
- **Seeded reproducibility** — Same seed = identical output across runs
- **Advanced FK control** — Uniform / weighted / fixed-per-parent distributions, weighted values, fixed value subsets
- **Multiple export formats** — CSV, JSON, JSONL, SQL INSERT statements, ZIP bundles, SQLite `.db` files
- **Read-only SQL queries** — Run queries against generated data through a built-in safe SQL authorizer

### App
- **Dashboard** — Live stats: total projects, tables, rows generated, completed jobs
- **Project management** — Search, rename, duplicate, delete with confirmation
- **Groups (workspaces)** — Organize projects into folders with custom icons; flat hierarchy; deleting a group reassigns its projects to Uncategorized
- **Light / dark theme** — Full Neon Architect palette in dark mode, Material-light variant in light mode; persists across reloads
- **Responsive UI** — Mobile-friendly (hamburger drawer, horizontal-scroll tables, vertically-scrollable modals) at <768px; desktop layout at ≥768px
- **Persistence** — Schemas, projects, and jobs stored in embedded SQLite (WAL mode)

### MCP (Model Context Protocol) server
- **AI-native interface** — Built-in MCP server exposes 18 tools so AI agents (Claude Code, Cursor, Cline, Continue, Claude Desktop, custom SDK clients) can manage schemas, projects, groups, and generation jobs entirely through natural language
- **C# Entity Framework Core import** — Paste a `DbContext` + entity classes; the parser detects PKs/FKs (attribute-based and convention-based) and emits a fully wired multi-table project
- **Streamable HTTP transport** — Mounted at `POST /mcp` on the same Fastify backend; no separate process

## Use Cases

### Test data & QA
- **Pre-built test fixtures** — generate a `.db` or `.sql` per scenario (empty / small / large / edge-case), commit it, tests open read-only.
- **Integration / E2E seed data** — multi-table project with FKs intact, exported as SQL `INSERT`s and replayed into the test DB.
- **Migration testing** — generate a "before" dataset, run the migration, verify the shape afterwards.
- **Bug reproduction** — share `seed=1234, rows=10k, schema=...` so a teammate gets bit-identical data.

### Performance & load
- **Load / stress testing** — push 1M-10M rows into a target DB to benchmark queries, indexes, EXPLAIN plans.
- **Index tuning** — realistic cardinalities (uniform / weighted / fixed-per-parent FKs) catch bad query plans that `generate_series` won't.
- **Pagination / virtualization stress** — enough rows to exercise virtual lists, infinite-scroll, cursor pagination.

### Demo & sales
- **Sales demos / customer-facing previews** — populate a fresh tenant with on-brand data (e-commerce / SaaS / healthcare templates).
- **Product screenshots & marketing assets** — coherent personas (`persona.fullName` + matching `persona.email` / `persona.city`) so demo screens look real.
- **Onboarding / trial accounts** — first-login population so the dashboard isn't empty.

### Development
- **Local dev seed data** — match production's shape without copying production data.
- **Frontend-only dev** — export to JSON, drop into a `db.json` for `json-server` or MSW.
- **Schema prototyping** — paste candidate Prisma/SQL DDL, generate a sample, sanity-check before committing the migration.
- **Anonymizing prod schemas** — keep production's structure (via SQL DDL import), regenerate values, share without PII.

### Compliance & training
- **GDPR / HIPAA-safe sample data** — no real values, safe to share externally.
- **Tutorials & training datasets** — predictable seeded data for screencasts, blog posts, course material.

### Data pipeline / ETL
- **Pipeline validation** — JSONL/CSV with edge cases (nulls, weighted enums, wide ranges) fed into the pipeline.
- **Reproducible benchmarks** — same seed + same schema = byte-identical dataset for comparing query engines.
- **CSV → SQL bridge** — upload a CSV, infer schema, export `CREATE TABLE` + `INSERT` to lift a spreadsheet into Postgres.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, TanStack Table, React Flow, react-dropzone |
| Backend | Fastify, TypeScript, Faker.js, Zod, better-sqlite3, papaparse, fast-csv, jszip, archiver, seedrandom |
| Storage | SQLite (embedded, WAL mode) — schemas, projects, jobs |
| Monorepo | npm workspaces |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Development

Run backend and frontend concurrently in separate terminals:

```bash
# Terminal 1 — Backend  (http://localhost:3001)
npm run dev:backend

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:frontend
```

The Vite dev server proxies `/api/v1/*` to the backend.

### Build

```bash
npm run build
```

## Routes

| Path | Description |
|---|---|
| `/` | Project list — create, search, rename, duplicate, delete projects |
| `/dashboard` | System overview, live stats, recent projects |
| `/projects/:id/:tab` | Project editor — tables, diagram, generate, export, query |
| `/single` | Single-table wizard — quick CSV/SQL/manual generation |
| `/profile` | User settings — theme toggle, instance ID, app preferences |

## API

Backend mounts under `/api/v1`. Selected endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Aggregate stats (total rows, completed jobs, last activity) |
| `POST` | `/schemas/infer/csv` | Infer columns from a CSV upload |
| `POST` | `/schemas/infer/sql` | Parse SQL DDL into a single-table schema |
| `POST` | `/projects/infer/prisma` | Parse a Prisma schema into a multi-table project |
| `POST` | `/projects/infer/sql` | Parse multi-table SQL DDL |
| `POST` | `/projects/:id/duplicate` | Deep-copy a project with fresh IDs |
| `POST` | `/generate` | Start a single-table job |
| `POST` | `/generate/project` | Start a multi-table project job |
| `GET` | `/generate/:jobId/preview` | Preview generated rows |
| `GET` | `/export/:jobId/{csv,json,sql,jsonl}` | Download single-table export |
| `GET` | `/export/project/:jobId/{zip,sqlite}` | Download multi-table export |
| `POST` | `/query/project/:jobId` | Run a read-only SQL query against generated data |
| `GET` / `POST` / `PUT` / `DELETE` | `/groups`, `/groups/:id` | Group (folder) CRUD; delete reassigns members to Uncategorized |

## MCP (Model Context Protocol)

The backend exposes a Streamable-HTTP MCP server at `POST /mcp` so AI agents can drive every workflow without the UI. Server name: **`synthetic-data`**, version `1.0.0`.

### Connect

Prerequisite: backend running at `http://127.0.0.1:3001` (`npm run dev:backend`). MCP endpoint is **`POST http://127.0.0.1:3001/mcp`** (Streamable HTTP transport — no separate process needed).

<details>
<summary><b>Claude Code (CLI)</b></summary>

```powershell
# Quickest — register the server globally for current user
claude mcp add --transport http syntheticdata http://127.0.0.1:3001/mcp

# Or scope it to a project so teammates pick it up via git
claude mcp add --transport http syntheticdata http://127.0.0.1:3001/mcp --scope project

# Verify
claude mcp list
claude mcp get syntheticdata

# In Claude Code, type /mcp — server must show as "connected" with 18 tools and 3 prompts
```

To commit the config with the repo, drop a `.mcp.json` at repo root:
```json
{
  "mcpServers": {
    "syntheticdata": { "type": "http", "url": "http://127.0.0.1:3001/mcp" }
  }
}
```
Claude Code will prompt for approval on first open.
</details>

<details>
<summary><b>claude.ai (web)</b></summary>

Open the workspace switcher (top-left) → **Connectors** → **Add custom connector**:
- Name: `syntheticdata`
- Type: `Remote MCP server`
- URL: `http://127.0.0.1:3001/mcp` (must be reachable from your browser — for cloud claude.ai, expose via tunnel like `cloudflared tunnel --url http://127.0.0.1:3001` or ngrok)

After adding, toggle the connector on inside any conversation. The 18 tools and 3 prompts become available to the model.

> Note: claude.ai (web) cannot reach `localhost` from Anthropic's servers — you MUST tunnel. Claude Code and Claude Desktop run locally and can hit `127.0.0.1` directly.
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json` (on Windows: `%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "syntheticdata": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```
Quit & relaunch Claude Desktop. The MCP "hammer" icon should show the server with its tools and prompts.
</details>

<details>
<summary><b>Cursor</b></summary>

Settings → MCP → Add new MCP Server:
- Name: `syntheticdata`
- Type: `http`
- URL: `http://127.0.0.1:3001/mcp`

Or edit `~/.cursor/mcp.json` directly with the same shape as Claude Desktop.
</details>

<details>
<summary><b>Cline / Continue.dev (VS Code)</b></summary>

Cline → Settings → MCP Servers → Edit MCP Settings:
```json
{
  "mcpServers": {
    "syntheticdata": {
      "url": "http://127.0.0.1:3001/mcp",
      "transport": "http"
    }
  }
}
```
Continue uses a similar `~/.continue/config.yaml` MCP section.
</details>

<details>
<summary><b>Programmatic client (Anthropic / OpenAI SDK or custom agent)</b></summary>

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'my-agent', version: '1.0' }, {});
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/mcp')));

const { tools } = await client.listTools();
const result = await client.callTool({ name: 'list_projects', arguments: {} });
```
</details>

### Verify connection

After registering, sanity-check the server:

```powershell
# Should return {"ok":true,"ts":"..."} — backend is up
curl http://127.0.0.1:3001/health

# Inspector — interactive UI to call tools and prompts
npx @modelcontextprotocol/inspector --transport http http://127.0.0.1:3001/mcp
# Then open http://localhost:6274
```

In Claude Code: `/mcp` shows `syntheticdata · connected · 18 tools · 3 prompts`. If it shows `failed`, run `claude --mcp-debug` to see stderr.

### Production / remote deployment

For non-localhost setups (e.g. backend behind a reverse proxy or in Docker):
1. Set `HOST=0.0.0.0` and `CORS_ORIGIN=https://your-frontend.example` on the backend.
2. Replace `127.0.0.1:3001` in the MCP URL with the public origin (`https://api.example.com/mcp`).
3. Confirm the proxy preserves `POST` and forwards `Mcp-Session-Id` header (Streamable HTTP requires it for session continuity).

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/mcp` shows `failed` in Claude Code | Backend down or wrong port | `curl http://127.0.0.1:3001/health` — start `npm run dev:backend` if no response |
| 400 on tool call but `prompts/list` works | Missing `Mcp-Session-Id` header after restart | Disconnect + reconnect in client; the backend session map is in-memory and resets on restart |
| Tools appear but slash prompts don't | Client doesn't support MCP `prompts` capability | Use Claude Code / Cursor / Cline — Continue support varies by version |
| Imported project missing from `list_projects` right after `infer_project_from_csharp_ef` | The frontend tab for that project was open and auto-saved a stale state, overwriting the import | Close the project tab in the browser before invoking MCP mutations |

### Tools

Single-table schemas (5):
| Tool | Purpose |
|---|---|
| `list_schemas` | List all single-table schemas |
| `create_schema` | Create a schema with column definitions |
| `infer_schema_from_sql` | Single-table CREATE TABLE DDL → schema |
| `start_generation` | Start a single-table generation job |
| `get_job_status` / `preview_rows` / `get_export_url` | Job control + result access |

Multi-table projects (5):
| Tool | Purpose |
|---|---|
| `list_projects` | List multi-table projects (id, name, tables, groupId) |
| `get_project` | Full project details (columns, FK pools) |
| `add_project_table` / `update_project_table` / `remove_project_table` | Per-table edits |
| `start_project_generation` | Start FK-aware multi-table job |

C# Entity Framework Core import (2):
| Tool | Purpose |
|---|---|
| `infer_project_from_csharp_ef` | Paste `DbContext` + entity `.cs` files → new project. Args: `name`, `files[]={filename,content}`, optional `groupId` |
| `sync_project_from_csharp_ef` | Strict-mirror an existing project from updated source (drop/add/update tables) |

Groups / workspaces (5):
| Tool | Purpose |
|---|---|
| `list_groups` | List groups + per-group project count |
| `create_group` / `rename_group` / `delete_group` | Folder CRUD; delete reassigns to Uncategorized |
| `move_project_to_group` | Set or clear a project's groupId |

### Prompts (slash commands in MCP clients)

Each MCP prompt becomes a slash command. In Claude Code: `/mcp__synthetic-data__<name>`; in Cursor/Cline/Continue/Claude Desktop the equivalent surfaces in their slash UI.

| Slash | Args | Effect |
|---|---|---|
| `/mcp__synthetic-data__list_projects` | none | Render all projects grouped by folder as a markdown table |
| `/mcp__synthetic-data__import_ef` | `<path> [folder]` | Glob `.cs` files at `path`, infer a project, optionally place in `folder` |
| `/mcp__synthetic-data__move_project` | `<project> <folder>` | Resolve both by name (create folder if missing), then move |

### Claude Code shortcuts

Shorter, project-scoped slash commands live in `.claude/commands/` and only work in Claude Code:

```
/synthetic-list-projects
/synthetic-import-ef <path> [folder]
/synthetic-move-project <project> <folder>
```

They wrap the same MCP tools as the MCP prompts above but with cleaner names.

### Example workflows

**Import a C# EF Core DbContext into a folder, then generate sample data:**
```
> /synthetic-import-ef D:\repos\MyApp\Data Backend
…
Imported "AppDbContext" (projectId=abc123) — 12 tables, 8 FKs, 0 warnings, folder=Backend

> Generate 1000 rows per table with seed=42
…
[calls start_project_generation, polls get_job_status, returns preview]
```

**Re-sync after schema changes:**
```
> The EF source at D:\repos\MyApp\Data was updated — sync project abc123 with the new files
…
[calls sync_project_from_csharp_ef → reports addedTables, removedTables, updatedTables]
```

### Test the MCP server in isolation

```powershell
# Launch MCP Inspector against the running backend
npx @modelcontextprotocol/inspector --transport http http://127.0.0.1:3001/mcp
# Inspector UI at http://localhost:6274
```

## Project Structure

```
synthetic/
├── packages/
│   ├── backend/          # Fastify API server
│   │   ├── data/         # Embedded SQLite (gitignored)
│   │   └── src/
│   │       ├── db/       # SQLite init & migrations
│   │       ├── routes/   # API route handlers
│   │       ├── services/ # Generation, export, parsing, rules
│   │       ├── store/    # SQLite-backed session store
│   │       └── types/    # Shared TypeScript types
│   └── frontend/         # React SPA
│       └── src/
│           ├── components/  # UI components (schema, project, generate, preview, layout)
│           ├── pages/       # Dashboard, ProjectList, ProjectEditor, SingleTablePage, Profile
│           ├── store/       # Zustand state management
│           ├── api/         # Axios client
│           └── index.css    # Theme tokens (CSS vars for dark/light)
└── package.json          # Root workspace config
```

## License

Internal / unlicensed. Contact the author for usage terms.
