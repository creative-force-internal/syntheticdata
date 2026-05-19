import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { schemaRoutes } from './routes/schema.routes.js';
import { generateRoutes } from './routes/generate.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { statsRoutes } from './routes/stats.routes.js';
import { templateRoutes } from './routes/template.routes.js';
import { groupRoutes } from './routes/group.routes.js';
import { mcpRoutes } from './routes/mcp.routes.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

// CORS_ORIGIN: comma-separated list, "*" for any origin, or unset.
// When the backend serves the frontend itself (FRONTEND_DIST set), CORS is
// only needed if you also expose the API to a separate origin.
const corsOriginEnv = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const corsOrigin: string | string[] | boolean =
  corsOriginEnv === '*'  ? true
  : corsOriginEnv === '' ? false
  : corsOriginEnv.includes(',') ? corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean)
  : corsOriginEnv;

if (corsOrigin !== false) {
  await app.register(cors, { origin: corsOrigin });
}

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 10);
await app.register(multipart, { limits: { fileSize: maxUploadMb * 1024 * 1024 } });

await app.register(schemaRoutes, { prefix: '/api/v1' });
await app.register(generateRoutes, { prefix: '/api/v1' });
await app.register(exportRoutes, { prefix: '/api/v1' });
await app.register(projectRoutes, { prefix: '/api/v1' });
await app.register(statsRoutes, { prefix: '/api/v1' });
await app.register(templateRoutes, { prefix: '/api/v1' });
await app.register(groupRoutes, { prefix: '/api/v1' });
await app.register(mcpRoutes);

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

// ─── Optional: serve built frontend (single-origin deployment) ────────────────
// Set FRONTEND_DIST to the absolute path of the built frontend (the directory
// produced by `vite build` — typically `packages/frontend/dist`). When set, the
// backend serves those static assets and falls back to index.html for SPA
// routes so a hard refresh on /projects/:id/:tab works.

const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : null;

if (frontendDist) {
  if (!fs.existsSync(frontendDist)) {
    app.log.error({ frontendDist }, 'FRONTEND_DIST does not exist — refusing to start');
    process.exit(1);
  }
  await app.register(fastifyStatic, { root: frontendDist, wildcard: false });

  const indexHtml = path.join(frontendDist, 'index.html');
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url === '/health') {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.type('text/html').send(fs.createReadStream(indexHtml));
  });
  app.log.info({ frontendDist }, 'Serving built frontend');
}

const port = Number(process.env.PORT ?? 3001);
// Default loopback for safety. Set HOST=0.0.0.0 inside containers or when a
// reverse proxy on the same host needs to reach the listener directly.
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
app.log.info(`Backend listening on http://${host}:${port}`);
