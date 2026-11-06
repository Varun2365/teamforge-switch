import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestOrg, testOrg } from './fixtures.js';
import { createTask, createTaskDependency, getOverdueTasks, searchTasks, assignTask } from '../src/services/taskService.js';
import { approveApproval, getPendingApprovals } from '../src/services/approvalService.js';
import { buildToolRegistry } from '../src/tools/index.js';
import { TaskAssignmentModel } from '../src/db/models/ops.js';

describe('tasks & approvals', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestOrg();
  });
  afterAll(teardownTestDb);

  it('finds overdue tasks from the fixture (API integration, 2 days late)', async () => {
    const { orgId, projectId } = testOrg();
    const overdue = await getOverdueTasks(orgId, projectId);
    expect(overdue.some((t) => t.title === 'Backend API integration')).toBe(true);
    for (const t of overdue) expect(t.daysOverdue).toBeGreaterThanOrEqual(1);
  });

  it('creates a task and assigns it with an assignment record', async () => {
    const { orgId, karanId } = testOrg();
    const task = await createTask({
      orgId,
      title: 'Launch checklist dry-run',
      priority: 'medium',
      assigneeUserId: karanId,
      createdBy: { type: 'user', name: 'test' },
    });
    const assignments = await TaskAssignmentModel.find({ orgId, taskId: task._id, active: true }).lean();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.userId).toBe(karanId);
  });

  it('rejects a dependency cycle (A → B, then B → A)', async () => {
    const { orgId } = testOrg();
    const a = await createTask({ orgId, title: 'Cycle A', createdBy: { type: 'user', name: 'test' } });
    const b = await createTask({ orgId, title: 'Cycle B', createdBy: { type: 'user', name: 'test' } });
    await createTaskDependency(orgId, a._id, b._id, 'blocks', { type: 'user', name: 'test' });
    await expect(createTaskDependency(orgId, b._id, a._id, 'blocks', { type: 'user', name: 'test' })).rejects.toThrow(/cycle/i);
  });

  it('self-dependency is rejected', async () => {
    const { orgId } = testOrg();
    const a = await createTask({ orgId, title: 'Self Depend', createdBy: { type: 'user', name: 'test' } });
    await expect(createTaskDependency(orgId, a._id, a._id, 'blocks', { type: 'user', name: 'test' })).rejects.toThrow(/itself/i);
  });

  it('agent assign_task routes to approval instead of assigning; approval applies it', async () => {
    const { orgId, apiTaskId, nehaId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:operations-manager' } }, 'assign_task', { taskId: apiTaskId, toUserId: nehaId, reason: 'Aarav is out sick' });
    expect(res.ok).toBe(true);
    const payload = (res as { ok: true; result: { status: string; approvalId?: string } }).result;
    expect(payload.status).toBe('approval_required');
    // still assigned to the original owner until approved
    const before = await TaskAssignmentModel.find({ orgId, taskId: apiTaskId, active: true }).lean();
    expect(before).toHaveLength(1);
    // approve
    const pending = await getPendingApprovals(orgId);
    const approval = pending.find((a) => a.payload && (a.payload as { toUserId?: string }).toUserId === nehaId);
    expect(approval).toBeTruthy();
    const result = await approveApproval(orgId, approval!._id, { name: 'Rahul Mehta' });
    expect(result.ok).toBe(true);
    const after = await TaskAssignmentModel.find({ orgId, taskId: apiTaskId, active: true }).lean();
    expect(after.map((a) => a.userId)).toContain(nehaId);
  });

  it('tool catalog refuses invalid arguments with structured error (no throw)', async () => {
    const { orgId } = testOrg();
    const registry = buildToolRegistry();
    const res = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:test' } }, 'create_task', { title: 'x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('invalid_arguments');
    const unknown = await registry.call({ orgId, actor: { type: 'agent', name: 'agent:test' } }, 'does_not_exist', {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('unknown_tool');
  });
});
