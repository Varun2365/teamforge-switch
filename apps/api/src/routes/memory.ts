import type { FastifyInstance } from 'fastify';
import { EntityModel, FactModel, MemoryProposalModel, MemoryVersionModel, EventModel } from '../db/models/memory.js';
import * as memory from '../services/memoryService.js';
import { recordSource } from '../services/sourceService.js';
import { correctFact } from '../services/memoryService.js';

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/api/memory/search', async (req) => {
    const { q, type, limit } = req.query as { q?: string; type?: string; limit?: string };
    if (!q || q.trim().length < 2) return { entities: [], facts: [], relationships: [], answerHints: [] };
    return memory.searchOrganizationMemory(req.auth.orgId, q, { type, limit: limit ? Number(limit) : 10 });
  });

  app.get('/api/entities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.auth;
    const entity = await EntityModel.findOne({ orgId, _id: id }).lean();
    if (!entity) return reply.code(404).send({ error: { code: 'not_found', message: 'Entity not found' } });
    const facts = await FactModel.find({ orgId, entityId: id, status: { $in: ['active', 'disputed', 'proposed'] } }).sort({ recordedAt: -1 }).lean();
    return { ...entity, id: entity._id, facts };
  });

  app.get('/api/entities/:id/relationships', async (req) => {
    const { id } = req.params as { id: string };
    return memory.getEntityRelationships(req.auth.orgId, id);
  });

  app.get('/api/entities/:id/history', async (req) => {
    const { id } = req.params as { id: string };
    return memory.getEntityHistory(req.auth.orgId, id);
  });

  app.get('/api/facts/history', async (req) => {
    const { entityId, predicate } = req.query as { entityId: string; predicate?: string };
    return memory.getFactHistory(req.auth.orgId, entityId, predicate);
  });

  app.get('/api/memory/versions', async (req) => {
    const { factId } = req.query as { factId: string };
    return MemoryVersionModel.find({ orgId: req.auth.orgId, factId }).sort({ at: 1 }).lean();
  });

  app.get('/api/events', async (req) => {
    const { kind, limit } = req.query as { kind?: string; limit?: string };
    const q: Record<string, unknown> = { orgId: req.auth.orgId };
    if (kind) q.kind = kind;
    return EventModel.find(q).sort({ occurredAt: -1 }).limit(Math.min(Number(limit ?? 50), 100)).lean();
  });

  app.get('/api/memory/proposals', async (req) => {
    const { status } = req.query as { status?: string };
    const q: Record<string, unknown> = { orgId: req.auth.orgId };
    if (status) q.status = status;
    return MemoryProposalModel.find(q).sort({ createdAt: -1 }).limit(100).lean();
  });

  app.post('/api/memory/proposals', async (req, reply) => {
    const body = req.body as { kind: string; summary: string; payload?: Record<string, unknown>; confidence?: number };
    if (!body?.kind || !body?.summary) return reply.code(400).send({ error: { code: 'bad_request', message: 'kind and summary are required' } });
    const proposal = await MemoryProposalModel.create({
      orgId: req.auth.orgId,
      kind: body.kind as never,
      summary: body.summary,
      payload: body.payload ?? {},
      confidence: body.confidence ?? 0.7,
      status: 'pending',
      requiresApproval: true,
      proposedBy: req.auth.actor.name,
    });
    return reply.code(201).send(proposal);
  });

  app.post('/api/memory/proposals/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const result = await memory.applyMemoryProposal(req.auth.orgId, id, req.auth.actor.name, note);
    if (!result.applied) return reply.code(409).send({ error: { code: 'conflict', message: result.detail } });
    return result;
  });

  app.post('/api/memory/proposals/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const proposal = await memory.rejectMemoryProposal(req.auth.orgId, id, req.auth.actor.name, note);
    if (!proposal) return reply.code(409).send({ error: { code: 'conflict', message: 'Proposal not found or already resolved' } });
    return { rejected: true };
  });

  app.post('/api/memory/correct', async (req, reply) => {
    const { factId, newValue, note } = req.body as { factId?: string; newValue?: unknown; note?: string };
    if (!factId) return reply.code(400).send({ error: { code: 'bad_request', message: 'factId is required' } });
    const src = note ? await recordSource({ orgId: req.auth.orgId, type: 'manual', ref: `correction:${Date.now()}`, excerpt: note, authorName: req.auth.actor.name }) : null;
    return correctFact(req.auth.orgId, factId, newValue, req.auth.actor.name, src?._id ? String(src._id) : undefined);
  });

  app.post('/api/entities/merge', async (req, reply) => {
    const { fromEntityId, toEntityId } = req.body as { fromEntityId?: string; toEntityId?: string };
    if (!fromEntityId || !toEntityId) return reply.code(400).send({ error: { code: 'bad_request', message: 'fromEntityId and toEntityId are required' } });
    return memory.mergeEntities(req.auth.orgId, fromEntityId, toEntityId, req.auth.actor.name);
  });
}
