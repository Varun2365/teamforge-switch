import {
  EntityModel,
  RelationshipModel,
  FactModel,
  MemoryVersionModel,
  MemoryProposalModel,
  EventModel,
  EntityTypeModel,
  RelationshipTypeModel,
  type Entity,
  type Fact,
  type Relationship,
  type MemoryProposal,
} from '../db/models/memory.js';
import { AliasModel } from '../db/models/org.js';
import { normalizeName, tokenSimilarity, editSimilarity } from '@teamforge/shared';
import { logAudit, recordEvent } from './audit.js';
import { recordSource } from './sourceService.js';

const AUTO_APPLY_CONFIDENCE = 0.8;
/** Predicates that always need a human before they take effect. */
const SENSITIVE_PREDICATES = new Set(['reports_to', 'salary', 'compensation', 'reassigned', 'resigned', 'terminated', 'access_granted', 'owns_budget']);

async function version(orgId: string, factId: string, action: 'created' | 'superseded' | 'disputed' | 'rejected' | 'corrected', before: unknown, after: unknown, actor: string, sourceId?: string) {
  await MemoryVersionModel.create({ orgId, factId, action, before, after, actor, sourceId, at: new Date() });
}

/* ───────────────────────── Core entity types & relationship types ───────────────────────── */

export const CORE_ENTITY_TYPES: Array<{ name: string; label: string; description: string }> = [
  { name: 'organization', label: 'Organization', description: 'The company itself' },
  { name: 'person', label: 'Person', description: 'An employee, founder, contractor or collaborator' },
  { name: 'department', label: 'Department', description: 'An organizational unit' },
  { name: 'team', label: 'Team', description: 'A working group' },
  { name: 'project', label: 'Project', description: 'A coordinated body of work' },
  { name: 'task', label: 'Task', description: 'A unit of work' },
  { name: 'client', label: 'Client', description: 'A customer' },
  { name: 'supplier', label: 'Supplier', description: 'A vendor or partner' },
  { name: 'product', label: 'Product', description: 'Something you sell' },
  { name: 'service', label: 'Service', description: 'A service you provide' },
  { name: 'meeting', label: 'Meeting', description: 'A scheduled discussion' },
  { name: 'document', label: 'Document', description: 'A file or brief' },
  { name: 'objective', label: 'Objective', description: 'A business goal' },
  { name: 'asset', label: 'Asset', description: 'Equipment, accounts, anything owned' },
  { name: 'location', label: 'Location', description: 'Office or remote hub' },
  { name: 'skill', label: 'Skill', description: 'A capability someone has' },
  { name: 'decision', label: 'Decision', description: 'A choice the organization made' },
  { name: 'event', label: 'Event', description: 'Something that happened' },
];

export const CORE_RELATIONSHIP_TYPES: Array<{ name: string; inverseName?: string; description: string }> = [
  { name: 'WORKS_FOR', inverseName: 'EMPLOYS', description: 'Person works for organization' },
  { name: 'MEMBER_OF', inverseName: 'HAS_MEMBER', description: 'Person is a member of team/department' },
  { name: 'REPORTS_TO', inverseName: 'MANAGES', description: 'Person reports to person' },
  { name: 'HAS_SKILL', inverseName: 'SKILL_OF', description: 'Person has skill' },
  { name: 'OWNS', inverseName: 'OWNED_BY', description: 'Person owns task/project' },
  { name: 'WORKS_ON', inverseName: 'WORKED_ON_BY', description: 'Person works on project' },
  { name: 'HAS_TASK', inverseName: 'TASK_OF', description: 'Project has task' },
  { name: 'DEPENDS_ON', inverseName: 'BLOCKS', description: 'Task depends on task' },
  { name: 'BLOCKS', inverseName: 'BLOCKED_BY', description: 'Task blocks task' },
  { name: 'BELONGS_TO', inverseName: 'CONTAINS', description: 'Project/entity belongs to department' },
  { name: 'COLLABORATES_WITH', inverseName: 'COLLABORATES_WITH', description: 'Person collaborates with person' },
  { name: 'AFFECTS', inverseName: 'AFFECTED_BY', description: 'Decision affects project/team' },
  { name: 'MADE_BY', inverseName: 'MAKES', description: 'Decision/commitment made by person' },
  { name: 'RELATES_TO', inverseName: 'RELATES_TO', description: 'Document/item relates to entity' },
  { name: 'ABOUT', inverseName: 'ABOUT', description: 'Meeting/document is about entity' },
];

export async function ensureCoreTypes(orgId: string | null = null) {
  for (const t of CORE_ENTITY_TYPES) {
    await EntityTypeModel.updateOne({ orgId, name: t.name }, { $setOnInsert: { ...t, orgId, isCore: true } }, { upsert: true });
  }
  for (const r of CORE_RELATIONSHIP_TYPES) {
    await RelationshipTypeModel.updateOne({ orgId, name: r.name }, { $setOnInsert: { ...r, orgId, isCore: true } }, { upsert: true });
  }
}

/* ───────────────────────── Entity creation & resolution ───────────────────────── */

export interface CreateEntityInput {
  orgId: string;
  type: string;
  name: string;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sourceId?: string | null;
  createdBy?: string;
  validFrom?: Date;
}

export async function createEntity(input: CreateEntityInput): Promise<Entity> {
  const doc = await EntityModel.create({
    orgId: input.orgId,
    type: input.type,
    name: input.name.trim(),
    normalizedName: normalizeName(input.name),
    attributes: input.attributes ?? {},
    metadata: input.metadata ?? {},
    sourceId: input.sourceId ?? undefined,
    createdBy: input.createdBy ?? 'system',
    validFrom: input.validFrom ?? new Date(),
  });
  await logAudit(input.orgId, { type: 'agent', name: input.createdBy ?? 'system' }, 'entity.created', { type: 'entity', id: doc._id }, { name: doc.name, type: doc.type });
  await recordEvent(input.orgId, 'entity.created', { entityId: doc._id, name: doc.name, type: doc.type }, new Date(), input.sourceId ?? undefined, doc._id);
  return doc.toObject() as Entity;
}

export interface ResolutionCandidate {
  entity: Entity;
  score: number;
  via: 'exact' | 'alias' | 'fuzzy';
}

export interface ResolutionResult {
  status: 'resolved' | 'ambiguous' | 'no_match';
  best?: ResolutionCandidate;
  candidates: ResolutionCandidate[];
  normalized: string;
}

/**
 * Resolve a spoken/written name to an existing entity.
 * exact (1.0) → alias (0.95) → fuzzy (scored). Below FUZZY_FLOOR we refuse to guess.
 */
export async function resolveEntity(orgId: string, rawName: string, type?: string): Promise<ResolutionResult> {
  const normalized = normalizeName(rawName);
  if (!normalized) return { status: 'no_match', candidates: [], normalized };

  const typeFilter = type ? { type } : {};
  const base = { orgId, status: 'active' as const, ...typeFilter };

  // 1) exact canonical match
  const exact = await EntityModel.find({ ...base, normalizedName: normalized }).limit(3).lean();
  if (exact.length === 1) return { status: 'resolved', best: { entity: exact[0] as unknown as Entity, score: 1, via: 'exact' }, candidates: exact.map((e) => ({ entity: e as unknown as Entity, score: 1, via: 'exact' as const })), normalized };

  // 2) alias match (person aliases resolve to the person entity)
  const aliases = await AliasModel.find({ orgId, normalizedAlias: normalized, status: 'active' }).limit(3).lean();
  if (aliases.length === 1 && aliases[0]!.entityId) {
    const ent = await EntityModel.findOne({ orgId, _id: aliases[0]!.entityId, status: 'active' }).lean();
    if (ent) return { status: 'resolved', best: { entity: ent as unknown as Entity, score: 0.95, via: 'alias' }, candidates: [{ entity: ent as unknown as Entity, score: 0.95, via: 'alias' }], normalized };
  }

  // aliases of people that point at user records
  if (aliases.length === 1 && aliases[0]!.entityType === 'person' && aliases[0]!.entityId) {
    // handled above — entity path is preferred
  }

  // 3) fuzzy over a bounded candidate set
  const candidates = await EntityModel.find({ ...base, normalizedName: { $regex: normalized.split(' ').filter((w) => w.length > 2).join('|') || normalized, $options: 'i' } })
    .limit(25)
    .lean();
  const scored: ResolutionCandidate[] = candidates
    .map((e) => ({ entity: e as unknown as Entity, score: Math.max(editSimilarity(normalized, e.normalizedName), tokenSimilarity(normalized, e.normalizedName)), via: 'fuzzy' as const }))
    .filter((c) => c.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: 'no_match', candidates: [], normalized };
  const [top, second] = scored;
  if (top!.score >= 0.86 && (!second || top!.score - second.score >= 0.15)) {
    return { status: 'resolved', best: top, candidates: scored, normalized };
  }
  return { status: 'ambiguous', best: top, candidates: scored, normalized };
}

/** Person entities mirror user records so memory + profiles stay in one graph. */
export async function ensurePersonEntity(orgId: string, userId: string, name: string, sourceId?: string | null, createdBy = 'system'): Promise<Entity> {
  const normalized = normalizeName(name);
  const existing = await EntityModel.findOne({ orgId, type: 'person', 'attributes.userId': userId }).lean();
  if (existing) return existing as unknown as Entity;
  const byName = await EntityModel.findOne({ orgId, type: 'person', normalizedName: normalized }).lean();
  if (byName) {
    await EntityModel.updateOne({ _id: byName._id }, { $set: { 'attributes.userId': userId } });
    return { ...(byName as unknown as Entity), attributes: { ...(byName.attributes as object), userId } };
  }
  return createEntity({ orgId, type: 'person', name, attributes: { userId }, sourceId, createdBy });
}

export async function upsertAlias(orgId: string, alias: string, entityId: string, entityType: string, sourceId: string | null, confidence = 0.9) {
  const normalized = normalizeName(alias);
  if (!normalized) return null;
  return AliasModel.updateOne(
    { orgId, normalizedAlias: normalized, entityId },
    { $setOnInsert: { orgId, alias, normalizedAlias: normalized, entityId, entityType, sourceId: sourceId ?? undefined, confidence, status: 'active' } },
    { upsert: true },
  );
}

/* ───────────────────────── Facts: temporal, provenance, contradictions ───────────────────────── */

export interface FactInput {
  orgId: string;
  entityId: string;
  predicate: string;
  value: unknown;
  validFrom?: Date;
  confidence?: number;
  sourceId?: string | null;
  createdBy?: string;
  visibilityScope?: 'org' | 'team' | 'private' | 'restricted';
  allowSystem?: boolean; // seed/migrations may write without an external source
}

const flattenValue = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

export interface FactResult {
  action: 'created' | 'deduplicated' | 'superseded' | 'contradicted';
  fact?: Fact;
  previousFactId?: string;
  contradictionWith?: Fact;
  proposalId?: string;
}

export async function createFact(input: FactInput): Promise<FactResult> {
  const valueText = flattenValue(input.value).slice(0, 2000);
  const predicate = input.predicate.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const confidence = input.confidence ?? 0.9;
  const createdBy = input.createdBy ?? 'system';

  if (!input.sourceId && !input.allowSystem) {
    // Provenance is non-negotiable for memory facts.
    throw new Error('createFact requires a sourceId (or allowSystem: true for seed/migrations)');
  }

  // Dedupe: identical active fact already exists
  const existing = await FactModel.findOne({ orgId: input.orgId, entityId: input.entityId, predicate, valueText, status: 'active', validUntil: null }).lean();
  if (existing) return { action: 'deduplicated', fact: existing as unknown as Fact };

  const needsApproval = (confidence < AUTO_APPLY_CONFIDENCE || SENSITIVE_PREDICATES.has(predicate));
  // Temporal semantics: confident, sourced updates SUPERSEDE the prior value (history kept).
  // Shaky updates (confidence < 0.5) are treated as disputes for a human to resolve.
  const isDispute = confidence < 0.5;

  if (isDispute) {
    // Do not silently overwrite. Record the dispute and raise a proposal for a human.
    const contradictor = await FactModel.findOne({ orgId: input.orgId, entityId: input.entityId, predicate, status: 'active', validUntil: null, valueText: { $ne: valueText } }).lean();
    const disputed = await FactModel.create({
      orgId: input.orgId,
      entityId: input.entityId,
      predicate,
      value: input.value as never,
      valueText,
      validFrom: input.validFrom ?? new Date(),
      confidence,
      sourceId: input.sourceId ?? undefined,
      createdBy,
      status: 'disputed',
      visibilityScope: input.visibilityScope ?? 'org',
      supersedesFactId: contradictor?._id ?? null,
    });
    await version(input.orgId, disputed._id, 'disputed', contradictor, disputed.toObject(), createdBy, input.sourceId ?? undefined);
    const proposal = await MemoryProposalModel.create({
      orgId: input.orgId,
      kind: 'fact',
      summary: `Conflicting information for "${predicate.replace(/_/g, ' ')}" — keeping both versions for a human to resolve`,
      payload: { entityId: input.entityId, predicate, previousFactId: contradictor?._id ?? null, factId: disputed._id, value: input.value },
      confidence,
      status: 'pending',
      requiresApproval: true,
      proposedBy: `agent:${createdBy.replace(/^agent:/, '')}`,
      sourceId: input.sourceId ?? undefined,
    });
    await logAudit(input.orgId, { type: 'agent', name: createdBy }, 'memory.contradicted', { type: 'fact', id: disputed._id }, { previousFactId: contradictor?._id ?? null });
    return { action: 'contradicted', fact: disputed.toObject() as Fact, contradictionWith: (contradictor ?? undefined) as unknown as Fact, proposalId: proposal._id };
  }

  const now = new Date();
  // NOTE: the local dev Mongo runs as a standalone (no replica set), so we deliberately
  // avoid multi-document transactions; each statement is individually atomic.
  const doomed = needsApproval
    ? []
    : await FactModel.find({ orgId: input.orgId, entityId: input.entityId, predicate, status: 'active', validUntil: null }).lean();
  if (!needsApproval && doomed.length) {
    await FactModel.updateMany(
      { _id: { $in: doomed.map((d) => d._id) } },
      { $set: { validUntil: now, status: 'superseded' } },
    );
  }
  const fact = await FactModel.create({
    orgId: input.orgId,
    entityId: input.entityId,
    predicate,
    value: input.value as never,
    valueText,
    validFrom: input.validFrom ?? now,
    confidence,
    sourceId: input.sourceId ?? undefined,
    createdBy,
    status: needsApproval ? 'proposed' : 'active',
    visibilityScope: input.visibilityScope ?? 'org',
    supersedesFactId: doomed[0]?._id ?? null,
  });
  if (!needsApproval) {
    for (const old of doomed) {
      await FactModel.updateOne({ _id: old._id }, { $set: { supersededByFactId: fact._id } });
      await version(input.orgId, old._id, 'superseded', old, fact.toObject(), createdBy, input.sourceId ?? undefined);
    }
  }
  await version(input.orgId, fact._id, 'created', null, fact.toObject(), createdBy, input.sourceId ?? undefined);
  if (needsApproval) {
    const proposal = await MemoryProposalModel.create({
      orgId: input.orgId,
      kind: 'fact',
      summary: `Fact to confirm: ${predicate.replace(/_/g, ' ')} = "${valueText}"`,
      payload: { entityId: input.entityId, predicate, value: input.value, factId: fact._id, previousFactIds: doomed.map((d) => d._id) },
      confidence,
      status: 'pending',
      requiresApproval: true,
      proposedBy: `agent:${createdBy.replace(/^agent:/, '')}`,
      sourceId: input.sourceId ?? undefined,
    });
    return { action: 'created', fact: fact.toObject() as Fact, proposalId: proposal._id };
  }
  if (doomed.length > 0) return { action: 'superseded', fact: fact.toObject() as Fact, previousFactId: doomed[0]!._id };
  return { action: 'created', fact: fact.toObject() as Fact };
}

export async function getActiveFacts(orgId: string, entityId: string): Promise<Fact[]> {
  return (await FactModel.find({ orgId, entityId, status: 'active', validUntil: null }).lean()) as unknown as Fact[];
}

export async function getFactHistory(orgId: string, entityId: string, predicate?: string): Promise<Fact[]> {
  const q: Record<string, unknown> = { orgId, entityId };
  if (predicate) q.predicate = predicate;
  return (await FactModel.find(q).sort({ recordedAt: 1 }).lean()) as unknown as Fact[];
}

/* ───────────────────────── Relationships ───────────────────────── */

export interface RelationshipInput {
  orgId: string;
  type: string;
  fromEntityId: string;
  toEntityId: string;
  attributes?: Record<string, unknown>;
  validFrom?: Date;
  confidence?: number;
  sourceId?: string | null;
  createdBy?: string;
}

export async function createRelationship(input: RelationshipInput): Promise<Relationship> {
  const type = input.type.trim().toUpperCase().replace(/\s+/g, '_');
  const existing = await RelationshipModel.findOne({ orgId: input.orgId, type, fromEntityId: input.fromEntityId, toEntityId: input.toEntityId, status: 'active', validUntil: null }).lean();
  if (existing) return existing as unknown as Relationship;
  const doc = await RelationshipModel.create({
    orgId: input.orgId,
    type,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    attributes: input.attributes ?? {},
    validFrom: input.validFrom ?? new Date(),
    confidence: input.confidence ?? 0.9,
    sourceId: input.sourceId ?? undefined,
    createdBy: input.createdBy ?? 'system',
  });
  await logAudit(input.orgId, { type: 'agent', name: input.createdBy ?? 'system' }, 'relationship.created', { type: 'relationship', id: doc._id }, { type });
  return doc.toObject() as Relationship;
}

export async function endRelationship(orgId: string, relationshipId: string, actor: string, at: Date = new Date()) {
  await RelationshipModel.updateOne({ orgId, _id: relationshipId, status: 'active' }, { $set: { status: 'superseded', validUntil: at } });
  await logAudit(orgId, { type: 'agent', name: actor }, 'relationship.ended', { type: 'relationship', id: relationshipId });
}

export async function getEntityRelationships(orgId: string, entityId: string) {
  const [outgoing, incoming] = await Promise.all([
    RelationshipModel.find({ orgId, fromEntityId: entityId, status: 'active' }).lean(),
    RelationshipModel.find({ orgId, toEntityId: entityId, status: 'active' }).lean(),
  ]);
  const ids = new Set<string>();
  for (const r of outgoing) ids.add(r.toEntityId);
  for (const r of incoming) ids.add(r.fromEntityId);
  const entities = await EntityModel.find({ orgId, _id: { $in: [...ids] } }).lean();
  const byId = new Map(entities.map((e) => [e._id, e]));
  return {
    outgoing: outgoing.map((r) => ({ ...r, other: byId.get(r.toEntityId) ?? null })),
    incoming: incoming.map((r) => ({ ...r, other: byId.get(r.fromEntityId) ?? null })),
  };
}

/* ───────────────────────── Search & retrieval ───────────────────────── */

export interface MemorySearchResult {
  entities: Entity[];
  facts: Fact[];
  relationships: Relationship[];
  answerHints: string[];
}

export async function searchOrganizationMemory(orgId: string, query: string, opts: { limit?: number; type?: string } = {}): Promise<MemorySearchResult> {
  const limit = Math.min(opts.limit ?? 10, 25);
  const normalized = normalizeName(query);
  const words = normalized.split(' ').filter((w) => w.length > 2);
  const regex = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || normalized, 'i');

  const entityQuery: Record<string, unknown> = { orgId, status: 'active', normalizedName: regex };
  if (opts.type) entityQuery.type = opts.type;
  const entities = (await EntityModel.find(entityQuery).limit(limit).lean()) as unknown as Entity[];

  const facts = (await FactModel.find({ orgId, status: 'active', valueText: regex }).sort({ recordedAt: -1 }).limit(limit).lean()) as unknown as Fact[];

  const entityIds = entities.map((e) => e._id);
  const relationships = entityIds.length
    ? ((await RelationshipModel.find({ orgId, status: 'active', $or: [{ fromEntityId: { $in: entityIds } }, { toEntityId: { $in: entityIds } }] }).limit(limit * 2).lean()) as unknown as Relationship[])
    : [];

  const answerHints: string[] = [];
  for (const e of entities.slice(0, 5)) answerHints.push(`${e.type}: ${e.name}`);
  for (const f of facts.slice(0, 5)) answerHints.push(`${f.predicate.replace(/_/g, ' ')} → ${f.valueText}`);

  return { entities, facts, relationships, answerHints };
}

export async function getEntityHistory(orgId: string, entityId: string) {
  const facts = await FactModel.find({ orgId, entityId }).sort({ recordedAt: 1 }).lean();
  const factIds = facts.map((f) => f._id as string);
  const [versions, relationships, events] = await Promise.all([
    MemoryVersionModel.find({ orgId, factId: { $in: factIds } }).sort({ at: 1 }).lean(),
    RelationshipModel.find({ orgId, $or: [{ fromEntityId: entityId }, { toEntityId: entityId }] }).sort({ validFrom: 1 }).lean(),
    EventModel.find({ orgId, entityId }).sort({ occurredAt: 1 }).lean(),
  ]);
  return { facts, versions, relationships, events };
}

/* ───────────────────────── Proposals: validate → apply / reject ───────────────────────── */

export async function applyMemoryProposal(orgId: string, proposalId: string, reviewedBy: string, note?: string): Promise<{ applied: boolean; detail: string }> {
  const proposal = await MemoryProposalModel.findOne({ orgId, _id: proposalId, status: 'pending' });
  if (!proposal) return { applied: false, detail: 'Proposal not found or already resolved' };
  const p = (proposal.payload ?? {}) as Record<string, unknown>;

  try {
    switch (proposal.kind) {
      case 'fact': {
        const factId = p.factId as string | undefined;
        if (factId) {
          const fact = await FactModel.findOne({ orgId, _id: factId });
          if (fact && fact.status === 'proposed') {
            // supersede prior active facts with same predicate
            const prior = await FactModel.find({ orgId, entityId: fact.entityId, predicate: fact.predicate, status: 'active', validUntil: null });
            const now = new Date();
            for (const old of prior) await FactModel.updateOne({ _id: old._id }, { $set: { status: 'superseded', validUntil: now, supersededByFactId: fact._id } });
            await FactModel.updateOne({ _id: fact._id }, { $set: { status: 'active', supersedesFactId: prior[0]?._id ?? null } });
            await version(orgId, fact._id, 'created', null, fact.toObject(), `user:${reviewedBy}`);
            proposal.status = 'approved'; proposal.reviewedBy = reviewedBy; proposal.reviewNote = note; proposal.resolvedAt = now;
            await proposal.save();
            await logAudit(orgId, { type: 'user', id: reviewedBy }, 'memory.proposal.approved', { type: 'proposal', id: proposal._id });
            return { applied: true, detail: 'Fact applied (prior values kept in history)' };
          }
          if (fact && fact.status === 'disputed') {
            const now = new Date();
            const contradictionId = fact.supersedesFactId;
            await FactModel.updateOne({ _id: fact._id }, { $set: { status: 'active', validUntil: null } });
            if (contradictionId) await FactModel.updateOne({ _id: contradictionId }, { $set: { status: 'superseded', validUntil: now, supersededByFactId: fact._id } });
            proposal.status = 'approved'; proposal.reviewedBy = reviewedBy; proposal.reviewNote = note; proposal.resolvedAt = now;
            await proposal.save();
            return { applied: true, detail: 'Contradiction resolved in favor of the newer information; history preserved' };
          }
        }
        proposal.status = 'approved'; proposal.reviewedBy = reviewedBy; proposal.resolvedAt = new Date();
        await proposal.save();
        return { applied: true, detail: 'Proposal approved' };
      }
      default: {
        proposal.status = 'approved'; proposal.reviewedBy = reviewedBy; proposal.reviewNote = note; proposal.resolvedAt = new Date();
        await proposal.save();
        return { applied: true, detail: 'Proposal approved' };
      }
    }
  } catch (err) {
    return { applied: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function rejectMemoryProposal(orgId: string, proposalId: string, reviewedBy: string, note?: string) {
  const proposal = await MemoryProposalModel.findOneAndUpdate(
    { orgId, _id: proposalId, status: 'pending' },
    { $set: { status: 'rejected', reviewedBy, reviewNote: note, resolvedAt: new Date() } },
    { new: true },
  );
  if (proposal) await logAudit(orgId, { type: 'user', id: reviewedBy }, 'memory.proposal.rejected', { type: 'proposal', id: proposal._id }, { note });
  return proposal;
}

export async function correctFact(orgId: string, factId: string, newValue: unknown, actorName: string, sourceId?: string): Promise<FactResult> {
  const fact = await FactModel.findOne({ orgId, _id: factId });
  if (!fact) throw new Error('Fact not found');
  // Supersede with the corrected value, keeping full history.
  return createFact({
    orgId,
    entityId: fact.entityId,
    predicate: fact.predicate,
    value: newValue,
    confidence: 1,
    sourceId: sourceId ?? null,
    createdBy: `user:${actorName}`,
    allowSystem: !sourceId,
  });
}

export async function mergeEntities(orgId: string, fromEntityId: string, toEntityId: string, actor: string): Promise<{ factsMoved: number; relationshipsMoved: number }> {
  // Sequential updates — standalone Mongo has no multi-document transactions.
  const facts = await FactModel.updateMany({ orgId, entityId: fromEntityId }, { $set: { entityId: toEntityId } });
  const relsFrom = await RelationshipModel.updateMany({ orgId, fromEntityId }, { $set: { fromEntityId: toEntityId } });
  const relsTo = await RelationshipModel.updateMany({ orgId, toEntityId: fromEntityId }, { $set: { toEntityId } });
  await AliasModel.updateMany({ orgId, entityId: fromEntityId }, { $set: { entityId: toEntityId } });
  await EntityModel.updateOne({ orgId, _id: fromEntityId }, { $set: { status: 'merged', mergedIntoId: toEntityId } });
  await logAudit(orgId, { type: 'user', name: actor }, 'entity.merged', { type: 'entity', id: fromEntityId }, { into: toEntityId });
  await recordEvent(orgId, 'entity.merged', { fromEntityId, toEntityId });
  return { factsMoved: facts.modifiedCount ?? 0, relationshipsMoved: (relsFrom.modifiedCount ?? 0) + (relsTo.modifiedCount ?? 0) };
}

/** Manual source for corrections sourced from outside chat. */
export async function manualSource(orgId: string, actorName: string, note: string) {
  return recordSource({ orgId, type: 'manual', ref: `manual:${Date.now()}`, authorName: actorName, excerpt: note });
}
