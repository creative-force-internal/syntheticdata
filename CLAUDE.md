# Synthetic Data Generator — CLAUDE.md

## Commands

```bash
# Install all workspace deps
npm install

# Dev (run both in separate terminals)
npm run dev:backend      # Fastify API → http://localhost:3001
npm run dev:frontend     # Vite SPA  → http://localhost:5173

# Type-check
cd packages/backend  && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit

# Production build
npm run build            # compiles backend TS + vite build

# Docker (single-origin)
docker compose up        # backend serves built frontend via FRONTEND_DIST
```

## Architecture

npm monorepo with two workspaces:

```
packages/
  backend/   Fastify API server (Node ESM, TypeScript, better-sqlite3)
  frontend/  React 19 SPA (Vite, Tailwind, Zustand, React Flow)
```

Backend mounts all routes under `/api/v1`. Frontend's Vite dev server proxies `/api/v1/*` to port 3001.

## Key Files

| File | Purpose |
|---|---|
| `packages/backend/src/server.ts` | Fastify entry point, env config, plugin registration |
| `packages/backend/src/db/database.ts` | SQLite init, WAL, startup job expiry |
| `packages/backend/src/types/index.ts` | **Shared types** — source of truth for all data shapes |
| `packages/backend/src/services/generator.service.ts` | Core row generation (Faker, seeded PRNG) |
| `packages/backend/src/services/multi-generate.service.ts` | Multi-table FK-aware generation with topo-sort |
| `packages/backend/src/services/streaming-generator.service.ts` | Chunked streaming (10k rows/chunk), cancellation |
| `packages/backend/src/services/rule-engine.service.ts` | Conditional rules (set/null/derive) |
| `packages/frontend/src/types/index.ts` | Frontend type mirrors — must stay in sync with backend types manually |
| `packages/frontend/src/store/projectStore.ts` | Zustand — multi-table project state |
| `packages/frontend/src/store/appStore.ts` | Zustand — global app state (theme, etc.) |
| `packages/frontend/src/api/client.ts` | Axios client for all API calls |

## Code Style

- **TypeScript strict mode** on both packages
- Backend uses **NodeNext** module resolution — all imports need `.js` extensions even for `.ts` source files (e.g., `import { db } from '../db/database.js'`)
- No test framework is set up; verify changes manually or via type-check
- API responses always follow `ApiResponse<T>` wrapper: `{ ok: true, data: T }` or `{ ok: false, error: string }`
- Frontend types in `packages/frontend/src/types/index.ts` are **manual mirrors** of backend types — update both when changing shared interfaces

## Environment Variables (Backend)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `HOST` | `127.0.0.1` | Bind address (set `0.0.0.0` for Docker/proxy) |
| `DB_PATH` | `./data/synthetic.db` | SQLite database file path |
| `FRONTEND_DIST` | _(unset)_ | Absolute path to built frontend; enables single-origin serving |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origins (`*` = all, `` = disabled, comma-separated list) |
| `MAX_UPLOAD_MB` | `10` | Max file upload size |
| `LOG_LEVEL` | `info` | Fastify logger level |

## Storage

- SQLite at `packages/backend/data/synthetic.db` (gitignored)
- Three tables: `schemas`, `projects`, `jobs` — all store JSON blobs in a `data TEXT` column
- Jobs auto-expire at startup if result JSONL files are missing; deleted after 7 days
- Generated rows streamed to JSONL temp files (not kept in memory)

## Generation Pipeline

```
Schema definition
  → topological sort (PK columns before FK columns)
  → per-row: PRNG-seeded Faker calls + persona cache + pool registry
  → conditional rules applied after base values
  → JSONL written to temp file in 10k-row chunks
  → export: CSV / JSON / JSONL / SQL INSERT / SQLite / ZIP
```

For multi-table projects, tables are sorted by FK dependencies before generation begins.

## Locales

7 supported locales: `en_US`, `ja`, `vi`, `de`, `da`, `fr`, `es`.  
`ja` and `vi` use custom override chains in `services/locale-data/` to fill gaps in Faker's sparse locale coverage.

## Routes Reference

| Prefix | File | Key endpoints |
|---|---|---|
| `/api/v1/schemas` | `schema.routes.ts` | CRUD single-table schemas, infer CSV/SQL |
| `/api/v1/generate` | `generate.routes.ts` | Start job, status poll, cancel |
| `/api/v1/export` | `export.routes.ts` | Download CSV/JSON/JSONL/SQL |
| `/api/v1/projects` | `project.routes.ts` | CRUD projects, infer Prisma/SQL/ER, multi-table generate, query |
| `/api/v1/stats` | `stats.routes.ts` | Aggregate stats |
| `/api/v1/templates` | `template.routes.ts` | Reusable schema templates |

## Frontend Routes

| Path | Component | Description |
|---|---|---|
| `/` | `ProjectList` | Project list — create, search, rename, duplicate, delete |
| `/dashboard` | `Dashboard` | Live stats overview |
| `/projects/:id/:tab` | `ProjectEditor` | 5-tab editor: tables / diagram / generate / export / query |
| `/single` | `SingleTablePage` | Single-table wizard |
| `/profile` | `Profile` | Theme toggle, instance settings |

## Gotchas

- **`.js` imports in backend**: NodeNext requires explicit `.js` extensions in import paths. TypeScript resolves them to `.ts` at compile time. Never import without the extension.
- **Types not shared via package**: Frontend and backend types are duplicated manually. If you add a field to backend `GeneratorConfig`, also update `packages/frontend/src/types/index.ts`.
- **Job result files are ephemeral**: JSONL temp files are deleted on restart if missing or after 7 days. Exports must be downloaded before the server restarts.
- **WAL checkpoint**: `maybeCheckpoint()` runs every 1000 progress updates to avoid unbounded WAL growth during large jobs.
- **Persona coherence**: Columns sharing the same `personaGroup` value pull from a per-row `PersonaCache` so name/email/city are consistent. Only works when `fakerFn` starts with `persona.*`.
- **FK distribution modes**: `fixed_per_parent` pre-assigns child counts before generation; `weighted` requires `fkFixedValues` to be set (dynamic UUIDs can't carry per-value weights).
- **CI pushes Docker images to GHCR** on `master` push. PRs only build (no push). Separate `Dockerfile.backend` and `Dockerfile.frontend`.
