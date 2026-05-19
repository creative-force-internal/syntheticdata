import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { groupStore, projectStore } from '../store/session.store.js';
import type { Group } from '../types/index.js';

const SafeIdRe = /^[A-Za-z0-9_-]{1,64}$/;

const GroupCreateZ = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
});

const GroupUpdateZ = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().min(1).max(50).optional(),
}).refine(d => d.name !== undefined || d.icon !== undefined, {
  message: 'At least one of name or icon is required',
});

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  // List groups (with project counts for convenience)
  app.get('/groups', async (_req, reply) => {
    const groups = groupStore.list();
    const projects = projectStore.list();
    const counts = new Map<string, number>();
    for (const p of projects) {
      if (p.groupId) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
    }
    const data = groups.map(g => ({ ...g, projectCount: counts.get(g.id) ?? 0 }));
    reply.send({ ok: true, data });
  });

  // Create group
  app.post('/groups', async (req, reply) => {
    const parsed = GroupCreateZ.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    const now = new Date().toISOString();
    const group: Group = {
      id: nanoid(),
      name: parsed.data.name,
      icon: parsed.data.icon,
      createdAt: now,
      updatedAt: now,
    };
    groupStore.set(group);
    reply.code(201).send({ ok: true, data: group });
  });

  // Update group (rename / change icon)
  app.put<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    if (!SafeIdRe.test(req.params.id)) return reply.code(400).send({ ok: false, error: 'invalid id' });
    const existing = groupStore.get(req.params.id);
    if (!existing) return reply.code(404).send({ ok: false, error: 'Group not found' });
    const parsed = GroupUpdateZ.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    const updated: Group = {
      ...existing,
      name: parsed.data.name ?? existing.name,
      icon: parsed.data.icon ?? existing.icon,
      updatedAt: new Date().toISOString(),
    };
    groupStore.set(updated);
    reply.send({ ok: true, data: updated });
  });

  // Delete group — reassigns member projects to groupId=null in a single transaction
  app.delete<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    if (!SafeIdRe.test(req.params.id)) return reply.code(400).send({ ok: false, error: 'invalid id' });
    if (!groupStore.get(req.params.id)) {
      return reply.code(404).send({ ok: false, error: 'Group not found' });
    }
    const reassigned = groupStore.deleteAndReassign(req.params.id);
    reply.send({ ok: true, data: { deleted: req.params.id, reassignedProjects: reassigned } });
  });
}
