import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import * as memory from '../services/memoryService.js';
import { MemoryProposalModel, FactModel, EntityModel } from '../db/models/memory.js';
import { recordSource } from '../services/sourceService.js';
import { DecisionModel } from '../db/models/ops.js';
import { EventModel } from '../db/models/memory.js';

export function registerMemoryTools(reg: ToolRegistry) {
  reg.register({
    name: 'search_organization_memory',
    description: 'Semantic-ish search across entities and facts. Use before answering any people/project/decision question.',
    tier: 'read',
    input: z.object({
      query: z.string().min(2),
      type: z.string().optional().describe('Restrict to an entity type, e.g. person, project, decision'),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    handler: ({ orgId }, { query, type, limit }) => memory.searchOrganizationMemory(orgId, query, { type, limit }),
  });

  reg.register({
    name: 'get_entity',
    description: 'Fetch one entity by id, including attributes and metadata.',
    tier: 'read',
    input: z.object({ entityId: z.string() }),
    handler: async ({ orgId }, { entityId }) => EntityModel.findOne({ orgId, _id: entityId }).lean(),
  });

  reg.register({
    name: 'find_entity',
    description: 'Resolve a name to entities with confidence. Use this instead of guessing who "Aaru" or "Priya" is. Returns resolved / ambiguous / no_match with candidates.',
    tier: 'read',
    input: z.object({
      name: z.string().min(1),
      type: z.string().optional(),
    }),
    handler: ({ orgId }, { name, type }) => memory.resolveEntity(orgId, name, type),
  });

  reg.register({
    name: 'get_entity_relationships',
    description: 'All active relationships for an entity — both directions, with the other entity included.',
    tier: 'read',
    input: z.object({ entityId: z.string() }),
    handler: ({ orgId }, { entityId }) => memory.getEntityRelationships(orgId, entityId),
  });

  reg.register({
    name: 'get_entity_history',
    description: 'Full timeline of an entity: facts (incl. superseded), fact-change audit, relationships, events. Answers "what changed and when".',
    tier: 'read',
    input: z.object({ entityId: z.string() }),
    handler: ({ orgId }, { entityId }) => memory.getEntityHistory(orgId, entityId),
  });

  reg.register({
    name: 'get_fact_history',
    description: 'Every recorded value of a predicate for an entity — active, superseded, disputed. Answers "who owns X now vs before".',
    tier: 'read',
    input: z.object({ entityId: z.string(), predicate: z.string().optional() }),
    handler: ({ orgId }, { entityId, predicate }) => memory.getFactHistory(orgId, entityId, predicate),
  });

  reg.register({
    name: 'propose_memory_update',
    description: 'Propose a memory change (fact/event/relationship/entity/correction/merge). High-confidence facts with a source auto-apply; everything else lands in the approvals queue for a human. Never bypass approval for sensitive predicates.',
    tier: 'sensitive',
    input: z.object({
      kind: z.enum(['entity', 'fact', 'relationship', 'event', 'correction', 'merge', 'reassignment', 'deadline_change']),
      summary: z.string().min(3),
      payload: z.record(z.unknown()).default({}),
      confidence: z.number().min(0).max(1).default(0.7),
      sourceId: z.string().optional().nullable(),
      proposedBy: z.string().default('agent:operations-manager'),
    }),
    handler: async ({ orgId }, input) => {
      if (input.kind === 'fact' && input.confidence >= 0.85 && input.sourceId) {
        const p = input.payload as { entityId?: string; predicate?: string; value?: unknown };
        if (p.entityId && p.predicate) {
          const res = await memory.createFact({
            orgId,
            entityId: p.entityId,
            predicate: p.predicate,
            value: p.value,
            confidence: input.confidence,
            sourceId: input.sourceId,
            createdBy: input.proposedBy,
          });
          return { applied: res.action !== 'contradicted', ...res };
        }
      }
      const proposal = await MemoryProposalModel.create({
        orgId,
        kind: input.kind,
        summary: input.summary,
        payload: input.payload,
        confidence: input.confidence,
        status: 'pending',
        requiresApproval: true,
        proposedBy: input.proposedBy,
        sourceId: input.sourceId ?? undefined,
      });
      return { applied: false, proposalId: proposal._id, detail: 'Queued for human approval' };
    },
  });

  reg.register({
    name: 'confirm_memory_update',
    description: 'Apply a pending memory proposal after a human approved it. Only for proposals that already exist — this records the human decision; it does not invent one.',
    tier: 'sensitive',
    input: z.object({ proposalId: z.string(), approvedBy: z.string().default('human'), note: z.string().optional() }),
    handler: ({ orgId }, { proposalId, approvedBy, note }) => memory.applyMemoryProposal(orgId, proposalId, approvedBy, note),
  });

  reg.register({
    name: 'correct_memory',
    description: 'Correct a stored fact. The old value is preserved as superseded history — nothing is deleted.',
    tier: 'sensitive',
    input: z.object({ factId: z.string(), newValue: z.unknown(), note: z.string().optional(), actorName: z.string().default('human') }),
    handler: ({ orgId }, { factId, newValue, note, actorName }) => memory.correctFact(orgId, factId, newValue, actorName),
  });

  reg.register({
    name: 'record_event',
    description: 'Record that something happened in the organization (hired, launched, shipped, decision made, incident, etc.).',
    tier: 'write',
    input: z.object({
      kind: z.string().min(2),
      entityId: z.string().optional(),
      payload: z.record(z.unknown()).default({}),
      sourceId: z.string().optional().nullable(),
      occurredAt: z.string().datetime().optional(),
      excerpt: z.string().optional(),
    }),
    handler: async ({ orgId }, input) => {
      let sourceId = input.sourceId ?? null;
      if (!sourceId && input.excerpt) {
        const src = await recordSource({ orgId, type: 'system', ref: `event:${Date.now()}`, excerpt: input.excerpt });
        sourceId = src._id!;
      }
      const doc = await EventModel.create({
        orgId,
        kind: input.kind,
        entityId: input.entityId,
        payload: input.payload as never,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceId: sourceId ?? undefined,
      });
      return { eventId: doc._id, kind: doc.kind, occurredAt: doc.occurredAt };
    },
  });

  reg.register({
    name: 'record_decision',
    description: 'Record a decision the organization made — with rationale and who was involved. Stored as an active decision memory.',
    tier: 'write',
    input: z.object({
      title: z.string().min(3),
      summary: z.string().optional(),
      rationale: z.string().optional(),
      projectId: z.string().optional(),
      decidedBy: z.array(z.string()).default([]),
      supersedesDecisionId: z.string().optional(),
      sourceId: z.string().optional().nullable(),
    }),
    handler: async ({ orgId }, input) => {
      if (input.supersedesDecisionId) {
        await DecisionModel.updateOne({ orgId, _id: input.supersedesDecisionId }, { $set: { status: 'superseded' } });
      }
      const doc = await DecisionModel.create({
        orgId,
        title: input.title,
        summary: input.summary,
        rationale: input.rationale,
        projectId: input.projectId,
        decidedBy: input.decidedBy,
        sourceId: input.sourceId ?? undefined,
        status: 'active',
      });
      if (input.supersedesDecisionId) await DecisionModel.updateOne({ orgId, _id: input.supersedesDecisionId }, { $set: { supersededById: doc._id } });
      return { decisionId: doc._id, title: doc.title };
    },
  });
}
