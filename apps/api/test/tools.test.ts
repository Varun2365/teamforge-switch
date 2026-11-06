import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestOrg, testOrg } from './fixtures.js';
import { buildToolRegistry } from '../src/tools/index.js';
import { OrganizationModel } from '../src/db/models/org.js';

describe('tool registry', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestOrg();
  });
  afterAll(teardownTestDb);

  it('registers the full catalog (>= 50 tools)', () => {
    const registry = buildToolRegistry();
    expect(registry.list().length).toBeGreaterThanOrEqual(50);
  });

  it('get_organization_overview returns real data', async () => {
    const { orgId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:test' } }, 'get_organization_overview', {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      const r = res.result as { totalPeople: number; openTasks: number; overdueTasks: number };
      expect(r.totalPeople).toBe(5);
      expect(r.openTasks).toBeGreaterThan(0);
      expect(r.overdueTasks).toBeGreaterThanOrEqual(1);
    }
  });

  it('enforces organization isolation between two orgs', async () => {
    const other = await OrganizationModel.create({ name: 'Other Org', slug: `other-${Math.random().toString(36).slice(2, 8)}` });
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId: other._id, actor: { type: 'agent', name: 'agent:test' } }, 'search_tasks', {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      const tasks = res.result as Array<{ orgId: string }>;
      expect(tasks).toHaveLength(0); // must see NOTHING from the Acme test org
    }
    const mine = await registry.call({ orgId: testOrg().orgId, actor: { type: 'agent', name: 'agent:test' } }, 'search_tasks', {});
    if (mine.ok) {
      const tasks = mine.result as Array<{ orgId: string }>;
      expect(tasks.length).toBeGreaterThan(0);
      for (const t of tasks) expect(t.orgId).toBe(testOrg().orgId);
    }
  });

  it('propose_task returns duplicate candidates for an overlapping title', async () => {
    const { orgId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:project-manager' } }, 'propose_task', { title: 'Backend API integration work' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const r = res.result as { duplicates: Array<{ task: { title: string } }> };
      expect(r.duplicates.length).toBeGreaterThanOrEqual(1);
      expect(r.duplicates[0]!.task.title).toContain('Backend API integration');
    }
  });

  it('assign_task by an agent creates approval and never mutates before approval', async () => {
    const { orgId, apiTaskId, priyaId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:operations-manager' } }, 'assign_task', { taskId: apiTaskId, toUserId: priyaId, reason: 'coverage' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const r = res.result as { status: string };
      expect(r.status).toBe('approval_required');
    }
    const { TaskAssignmentModel } = await import('../src/db/models/ops.js');
    const assignment = await TaskAssignmentModel.findOne({ orgId, taskId: apiTaskId, active: true, userId: priyaId }).lean();
    expect(assignment).toBeNull(); // agent cannot self-assign a person without approval
  });

  it('unknown tool returns unknown_tool', async () => {
    const { orgId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:test' } }, 'nope', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('unknown_tool');
  });
});
