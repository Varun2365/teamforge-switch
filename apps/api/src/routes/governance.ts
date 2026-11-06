import type { FastifyInstance } from 'fastify';
import { approveApproval, rejectApproval, listApprovals, getPendingApprovals } from '../services/approvalService.js';
import { listReminders, createReminder, updateReminder, cancelReminder } from '../services/reminderService.js';
import { ApprovalModel, AgentActionModel, NotificationModel, ScheduledJobModel } from '../db/models/comms.js';
import { recordEvent } from '../services/audit.js';

export async function governanceRoutes(app: FastifyInstance) {
  /* Approvals */
  app.get('/api/approvals', async (req) => {
    const { status } = req.query as { status?: string };
    return listApprovals(req.auth.orgId, status);
  });

  app.get('/api/approvals/pending', async (req) => getPendingApprovals(req.auth.orgId));

  app.post('/api/approvals/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const result = await approveApproval(req.auth.orgId, id, { userId: req.auth.actor.id, name: req.auth.actor.name }, note);
    if (!result.ok) return reply.code(409).send({ error: { code: 'conflict', message: result.detail } });
    return result;
  });

  app.post('/api/approvals/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const result = await rejectApproval(req.auth.orgId, id, { userId: req.auth.actor.id, name: req.auth.actor.name }, note);
    if (!result.ok) return reply.code(409).send({ error: { code: 'conflict', message: result.detail } });
    return result;
  });

  /* Reminders */
  app.get('/api/reminders', async (req) => {
    const { userId, status } = req.query as { userId?: string; status?: string };
    return listReminders(req.auth.orgId, { userId, status });
  });

  app.post('/api/reminders', async (req, reply) => {
    const body = req.body as Record<string, unknown> & { title?: string; dueAt?: string };
    if (!body?.title || !body?.dueAt) return reply.code(400).send({ error: { code: 'bad_request', message: 'title and dueAt are required' } });
    const { reminder } = await createReminder(req.auth.orgId, {
      title: body.title,
      body: body.body as string | undefined,
      userId: (body.userId as string | undefined) ?? null,
      roomId: (body.roomId as string | undefined) ?? null,
      dueAt: new Date(body.dueAt),
      repeatRule: (body.repeatRule as never) ?? null,
      createdBy: req.auth.actor,
      idempotencyKey: (body.idempotencyKey as string | undefined) ?? undefined,
    });
    return reply.code(201).send(reminder);
  });

  app.patch('/api/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await updateReminder(req.auth.orgId, id, req.body as never);
    if (!updated) return reply.code(404).send({ error: { code: 'not_found', message: 'Reminder not found' } });
    return updated;
  });

  app.delete('/api/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await cancelReminder(req.auth.orgId, id, req.auth.actor.name);
    if (!r) return reply.code(404).send({ error: { code: 'not_found', message: 'Reminder not found' } });
    return { cancelled: true };
  });

  /* Agent activity + notifications (dashboard feed) */
  app.get('/api/agent-actions', async (req) => {
    const { agent, limit } = req.query as { agent?: string; limit?: string };
    const q: Record<string, unknown> = { orgId: req.auth.orgId };
    if (agent) q.agent = agent;
    return AgentActionModel.find(q).sort({ at: -1 }).limit(Math.min(Number(limit ?? 50), 100)).lean();
  });

  app.get('/api/notifications', async (req) => {
    const { status, kind, limit } = req.query as { status?: string; kind?: string; limit?: string };
    const q: Record<string, unknown> = { orgId: req.auth.orgId };
    if (status) q.status = status;
    if (kind) q.kind = kind;
    return NotificationModel.find(q).sort({ at: -1 }).limit(Math.min(Number(limit ?? 30), 100)).lean();
  });

  app.get('/api/scheduled-jobs', async (req) => {
    const { status, limit } = req.query as { status?: string; limit?: string };
    const q: Record<string, unknown> = { orgId: req.auth.orgId };
    if (status) q.status = status;
    return ScheduledJobModel.find(q).sort({ runAt: 1 }).limit(Math.min(Number(limit ?? 50), 100)).lean();
  });

  /* Switch/connection status for Settings + Agents pages */
  app.get('/api/switch/status', async () => {
    const { getSwitchRuntime } = await import('../integrations/switch/runtime.js');
    const runtime = getSwitchRuntime()?.getStatus() ?? null;
    const demoMode = (await import('../config.js')).config.TEAMFORGE_DEMO_MODE;
    const serverUrl = (await import('../config.js')).config.SWITCH_SERVER_URL;
    let server = 'unreachable';
    try {
      const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
      server = res.ok ? 'reachable' : `http ${res.status}`;
    } catch {
      server = 'unreachable';
    }
    return {
      demoMode,
      serverUrl,
      server,
      live: Boolean(runtime?.running && runtime.onlineAgents > 0),
      runtime,
      proactiveBridgeConfigured: Boolean((await import('../config.js')).config.SWITCH_PROACTIVE_API_KEY),
      rooms: {
        lobby: (runtime?.roomId ?? (await import('../config.js')).config.SWITCH_LOBBY_ROOM_ID) || null,
        digest: (await import('../config.js')).config.SWITCH_DIGEST_ROOM_ID || null,
      },
    };
  });

  /* Escape hatch for tests — record a typed event manually */
  app.post('/api/events', async (req, reply) => {
    const body = req.body as { kind?: string; payload?: Record<string, unknown> };
    if (!body?.kind) return reply.code(400).send({ error: { code: 'bad_request', message: 'kind is required' } });
    await recordEvent(req.auth.orgId, body.kind, body.payload ?? {});
    return { ok: true };
  });
}
