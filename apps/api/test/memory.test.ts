import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestOrg, testOrg } from './fixtures.js';
import { createEntity, resolveEntity, createFact, getFactHistory, mergeEntities, createRelationship } from '../src/services/memoryService.js';
import { SourceModel } from '../src/db/models/memory.js';

describe('memory engine', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestOrg();
  });
  afterAll(teardownTestDb);

  const src = async () => String((await SourceModel.create({ orgId: testOrg().orgId, type: 'system', ref: `test:${Math.random()}` }))._id);

  it('creates entities and resolves them by exact name', async () => {
    const { orgId } = testOrg();
    const e = await createEntity({ orgId, type: 'client', name: 'Globex Corporation', sourceId: await src(), createdBy: 'test' });
    const res = await resolveEntity(orgId, 'Globex Corporation');
    expect(res.status).toBe('resolved');
    expect(res.best?.entity._id).toBe(e._id);
  });

  it('resolves aliases ("Aaru" → the Aarav entity created via person mirror)', async () => {
    const { orgId } = testOrg();
    // seed creates no person entities automatically; create + alias explicitly
    const e = await createEntity({ orgId, type: 'person', name: 'Aarav Sharma', sourceId: await src(), createdBy: 'test' });
    const { upsertAlias } = await import('../src/services/memoryService.js');
    await upsertAlias(orgId, 'Aaru', e._id, 'person', await src(), 0.95);
    const res = await resolveEntity(orgId, 'Aaru', 'person');
    expect(res.status).toBe('resolved');
    expect(res.best?.via).toBe('alias');
    expect(res.best?.entity._id).toBe(e._id);
  });

  it('returns ambiguous rather than guessing on weak fuzzy match', async () => {
    const { orgId } = testOrg();
    await createEntity({ orgId, type: 'person', name: 'Rohan Gupta', sourceId: await src(), createdBy: 'test' });
    await createEntity({ orgId, type: 'person', name: 'Rohan Mehta', sourceId: await src(), createdBy: 'test' });
    const res = await resolveEntity(orgId, 'Rohan M', 'person');
    expect(['ambiguous', 'no_match']).toContain(res.status);
    expect(res.status).not.toBe('resolved');
  });

  it('supersedes facts instead of overwriting, keeping full history', async () => {
    const { orgId } = testOrg();
    const e = await createEntity({ orgId, type: 'person', name: 'Profiled Person', sourceId: await src(), createdBy: 'test' });
    const sourceId = await src();
    const first = await createFact({ orgId, entityId: e._id, predicate: 'responsible_for', value: 'Backend', sourceId, createdBy: 'test' });
    expect(first.action).toBe('created');
    const second = await createFact({ orgId, entityId: e._id, predicate: 'responsible_for', value: 'Frontend', sourceId, createdBy: 'test' });
    expect(second.action).toBe('superseded');
    const history = await getFactHistory(orgId, e._id, 'responsible_for');
    const values = history.map((f) => f.valueText);
    expect(values).toContain('Backend');
    expect(values).toContain('Frontend');
    const active = history.filter((f) => f.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]!.valueText).toBe('Frontend');
    const old = history.find((f) => f.valueText === 'Backend')!;
    expect(old.status).toBe('superseded');
    expect(old.validUntil).toBeTruthy();
  });

  it('deduplicates identical active facts', async () => {
    const { orgId } = testOrg();
    const e = await createEntity({ orgId, type: 'project', name: 'Dedupe Me', sourceId: await src(), createdBy: 'test' });
    const sourceId = await src();
    await createFact({ orgId, entityId: e._id, predicate: 'status', value: 'active', sourceId, createdBy: 'test' });
    const again = await createFact({ orgId, entityId: e._id, predicate: 'status', value: 'active', sourceId, createdBy: 'test' });
    expect(again.action).toBe('deduplicated');
  });

  it('marks low-confidence contradictory facts as disputed and raises a proposal — never silently overwrites', async () => {
    const { orgId } = testOrg();
    const e = await createEntity({ orgId, type: 'decision', name: 'Contradiction Test', sourceId: await src(), createdBy: 'test' });
    const sourceId = await src();
    await createFact({ orgId, entityId: e._id, predicate: 'pricing', value: 'free tier', sourceId, createdBy: 'test' });
    // A shaky conflicting claim (low confidence) — the backend does NOT overwrite silently.
    const conflict = await createFact({ orgId, entityId: e._id, predicate: 'pricing', value: 'paid only', sourceId, createdBy: 'test', confidence: 0.4 });
    expect(conflict.action).toBe('contradicted');
    expect(conflict.proposalId).toBeTruthy();
    const history = await getFactHistory(orgId, e._id, 'pricing');
    const statuses = history.map((f) => f.status).sort();
    expect(statuses).toContain('disputed');
    expect(statuses).toContain('active');
  });

  it('moves facts/relationships when merging duplicate entities', async () => {
    const { orgId } = testOrg();
    const a = await createEntity({ orgId, type: 'client', name: 'Initech', sourceId: await src(), createdBy: 'test' });
    const b = await createEntity({ orgId, type: 'client', name: 'Initech Ltd', sourceId: await src(), createdBy: 'test' });
    const sourceId = await src();
    await createFact({ orgId, entityId: a._id, predicate: 'tier', value: 'gold', sourceId, createdBy: 'test' });
    const res = await mergeEntities(orgId, a._id, b._id, 'tester');
    expect(res.factsMoved).toBe(1);
    const history = await getFactHistory(orgId, b._id, 'tier');
    expect(history.some((f) => f.valueText === 'gold')).toBe(true);
  });
});
