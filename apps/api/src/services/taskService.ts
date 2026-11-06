import { TaskModel, TaskAssignmentModel, TaskDependencyModel, ProjectModel, CommitmentModel, type Task } from '../db/models/ops.js';
import { UserModel } from '../db/models/org.js';
import { logAudit, recordEvent } from './audit.js';

export interface CreateTaskInput {
  orgId: string;
  title: string;
  description?: string;
  projectId?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  tags?: string[];
  dueDate?: Date | null;
  assigneeUserId?: string | null;
  reporterUserId?: string | null;
  createdBy: { type: 'user' | 'agent' | 'system'; id?: string; name: string };
  sourceId?: string | null;
  method?: 'direct' | 'recommended' | 'self' | 'approval';
  reason?: string;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const task = await TaskModel.create({
    orgId: input.orgId,
    projectId: input.projectId ?? undefined,
    title: input.title.trim(),
    description: input.description,
    priority: input.priority ?? 'medium',
    category: input.category ?? 'general',
    tags: input.tags ?? [],
    dueDate: input.dueDate ?? undefined,
    reporterUserId: input.reporterUserId ?? undefined,
    createdBy: input.createdBy,
    sourceId: input.sourceId ?? undefined,
    status: 'todo',
  });
  if (input.assigneeUserId) {
    await TaskAssignmentModel.create({
      orgId: input.orgId,
      taskId: task._id,
      userId: input.assigneeUserId,
      assignedBy: input.createdBy,
      method: input.method ?? 'direct',
      reason: input.reason,
      active: true,
    });
    await recordEvent(input.orgId, 'task.assigned', { taskId: task._id, userId: input.assigneeUserId, title: task.title }, new Date(), input.sourceId ?? undefined);
  }
  await recordEvent(input.orgId, 'task.created', { taskId: task._id, title: task.title, projectId: input.projectId ?? null }, new Date(), input.sourceId ?? undefined);
  await logAudit(input.orgId, input.createdBy, 'task.created', { type: 'task', id: task._id }, { title: task.title });
  return task.toObject() as Task;
}

export async function getTask(orgId: string, taskId: string) {
  const task = await TaskModel.findOne({ orgId, _id: taskId }).lean();
  if (!task) return null;
  const assignments = await TaskAssignmentModel.find({ orgId, taskId, active: true }).lean();
  const userIds = assignments.map((a) => a.userId);
  const users = await UserModel.find({ orgId, _id: { $in: userIds } }).lean();
  const byId = new Map(users.map((u) => [u._id, u]));
  return {
    ...task,
    id: task._id,
    assignees: assignments.map((a) => ({ userId: a.userId, name: byId.get(a.userId ?? '')?.name ?? 'unknown', method: a.method, assignedAt: a.assignedAt })),
  };
}

export interface SearchTasksOptions {
  projectId?: string;
  assigneeUserId?: string;
  status?: string;
  overdue?: boolean;
  limit?: number;
  query?: string;
}

export async function searchTasks(orgId: string, opts: SearchTasksOptions = {}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const q: Record<string, unknown> = { orgId };
  if (opts.projectId) q.projectId = opts.projectId;
  if (opts.status) q.status = opts.status;
  if (opts.overdue) {
    q.dueDate = { $lt: new Date() };
    if (!opts.status) q.status = { $nin: ['done', 'cancelled'] };
  }
  if (opts.query) q.title = { $regex: opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  let tasks = await TaskModel.find(q).sort({ dueDate: 1, createdAt: -1 }).limit(limit).lean();
  if (opts.assigneeUserId) {
    const assignments = await TaskAssignmentModel.find({ orgId, userId: opts.assigneeUserId, active: true, taskId: { $in: tasks.map((t) => t._id) } }).lean();
    const ids = new Set(assignments.map((a) => a.taskId));
    tasks = tasks.filter((t) => ids.has(t._id));
  }
  // Attach active assignees so list views can show owners without N+1 client calls.
  const allAssignments = await TaskAssignmentModel.find({ orgId, active: true, taskId: { $in: tasks.map((t) => t._id) } }).lean();
  const userIds = [...new Set(allAssignments.map((a) => a.userId).filter((x): x is string => Boolean(x)))];
  const users = userIds.length ? await UserModel.find({ orgId, _id: { $in: userIds } }).lean() : [];
  const nameById = new Map(users.map((u) => [u._id, u.name]));
  const byTask = new Map<string, Array<{ userId: string; name: string; method?: string }>>();
  for (const a of allAssignments) {
    const list = byTask.get(a.taskId ?? '') ?? [];
    list.push({ userId: a.userId ?? '', name: nameById.get(a.userId ?? '') ?? 'unknown', method: a.method });
    byTask.set(a.taskId ?? '', list);
  }
  return tasks.map((t) => ({ ...t, id: t._id, assignees: byTask.get(t._id) ?? [] }));
}

export async function updateTask(orgId: string, taskId: string, patch: Record<string, unknown>, actor: { type: 'user' | 'agent' | 'system'; name: string }) {
  const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'category', 'tags', 'projectId'];
  const set: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) set[k] = patch[k];
  if (set.status === 'done') set.completedAt = new Date();
  const task = await TaskModel.findOneAndUpdate({ orgId, _id: taskId }, { $set: set }, { new: true }).lean();
  if (task) {
    await logAudit(orgId, actor, 'task.updated', { type: 'task', id: taskId }, patch);
    if (patch.status === 'done') {
      await recordEvent(orgId, 'task.completed', { taskId, title: task.title });
      // Close commitments linked to this task
      await CommitmentModel.updateMany({ orgId, relatedTaskId: taskId, status: 'open' }, { $set: { status: 'done', completedAt: new Date() } });
    }
  }
  return task;
}

export async function assignTask(orgId: string, taskId: string, userId: string, assignedBy: { type: 'user' | 'agent' | 'system'; name: string; id?: string }, opts: { method?: 'direct' | 'recommended' | 'self' | 'approval' | 'reassigned'; reason?: string } = {}) {
  await TaskAssignmentModel.updateMany({ orgId, taskId, active: true }, { $set: { active: false, unassignedAt: new Date() } });
  const assignment = await TaskAssignmentModel.create({
    orgId,
    taskId,
    userId,
    assignedBy: { type: assignedBy.type, id: assignedBy.id, name: assignedBy.name },
    method: opts.method ?? 'direct',
    reason: opts.reason,
    active: true,
  });
  const task = await TaskModel.findOne({ orgId, _id: taskId }).lean();
  await recordEvent(orgId, 'task.assigned', { taskId, userId, title: task?.title });
  await logAudit(orgId, assignedBy, 'task.assigned', { type: 'task', id: taskId }, { userId, method: assignment.method });
  return assignment.toObject();
}

export async function completeTask(orgId: string, taskId: string, actor: { type: 'user' | 'agent' | 'system'; name: string }) {
  return updateTask(orgId, taskId, { status: 'done' }, actor);
}

export async function getTaskDependencies(orgId: string, taskId: string) {
  const deps = await TaskDependencyModel.find({ orgId, taskId }).lean();
  const blockedBy = await TaskDependencyModel.find({ orgId, dependsOnTaskId: taskId }).lean();
  const ids = [...new Set([...deps.map((d) => d.dependsOnTaskId), ...blockedBy.map((d) => d.taskId)])];
  const tasks = await TaskModel.find({ orgId, _id: { $in: ids } }).lean();
  const byId = new Map(tasks.map((t) => [t._id, t]));
  return {
    dependsOn: deps.map((d) => ({ id: d._id, task: byId.get(d.dependsOnTaskId) ?? null, kind: d.kind })),
    blocking: blockedBy.map((d) => ({ id: d._id, task: byId.get(d.taskId) ?? null, kind: d.kind })),
  };
}

async function wouldCycle(orgId: string, taskId: string, candidateDependencyId: string): Promise<boolean> {
  // Follow the dependsOn chain from candidateDependencyId; if we reach taskId, adding this edge creates a cycle.
  const seen = new Set<string>();
  let frontier = [candidateDependencyId];
  while (frontier.length) {
    const deps = await TaskDependencyModel.find({ orgId, taskId: { $in: frontier } }).lean();
    const next: string[] = [];
    for (const d of deps) {
      if (d.dependsOnTaskId === taskId) return true;
      if (!seen.has(d.dependsOnTaskId)) { seen.add(d.dependsOnTaskId); next.push(d.dependsOnTaskId); }
    }
    frontier = next;
  }
  return false;
}

export async function createTaskDependency(orgId: string, taskId: string, dependsOnTaskId: string, kind: 'blocks' | 'needed_by', actor: { type: 'user' | 'agent' | 'system'; name: string }) {
  if (taskId === dependsOnTaskId) throw new Error('A task cannot depend on itself');
  const [a, b] = await Promise.all([TaskModel.findOne({ orgId, _id: taskId }).lean(), TaskModel.findOne({ orgId, _id: dependsOnTaskId }).lean()]);
  if (!a || !b) throw new Error('Both tasks must exist in this organization');
  if (await wouldCycle(orgId, taskId, dependsOnTaskId)) throw new Error('That dependency would create a cycle');
  const doc = await TaskDependencyModel.updateOne(
    { orgId, taskId, dependsOnTaskId, kind },
    { $setOnInsert: { orgId, taskId, dependsOnTaskId, kind } },
    { upsert: true },
  );
  await logAudit(orgId, actor, 'task.dependency.created', { type: 'task', id: taskId }, { dependsOnTaskId, kind });
  return { created: doc.upsertedCount === 1, taskId, dependsOnTaskId, kind };
}

export async function getOverdueTasks(orgId: string, projectId?: string) {
  const q: Record<string, unknown> = { orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $lt: new Date() } };
  if (projectId) q.projectId = projectId;
  const tasks = await TaskModel.find(q).sort({ dueDate: 1 }).lean();
  const assignments = await TaskAssignmentModel.find({ orgId, active: true, taskId: { $in: tasks.map((t) => t._id) } }).lean();
  const userIds = [...new Set(assignments.map((a) => a.userId))];
  const users = await UserModel.find({ orgId, _id: { $in: userIds } }).lean();
  const userById = new Map(users.map((u) => [u._id, u]));
  return tasks.map((t) => ({
    ...t,
    id: t._id,
    assignees: assignments.filter((a) => a.taskId === t._id).map((a) => ({ userId: a.userId, name: userById.get(a.userId ?? '')?.name ?? 'unassigned' })),
    daysOverdue: t.dueDate ? Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86400000) : 0,
  }));
}
