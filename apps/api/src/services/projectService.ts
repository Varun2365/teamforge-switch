import { ProjectModel, TaskModel, MilestoneModel, ProjectMembershipModel, type Project } from '../db/models/ops.js';
import { GoalModel } from '../db/models/ops.js';
import { UserModel } from '../db/models/org.js';
import { logAudit, recordEvent } from './audit.js';
import { normalizeName } from '@teamforge/shared';

export async function createProject(orgId: string, input: {
  name: string;
  description?: string;
  category?: string;
  dueDate?: Date | null;
  startDate?: Date | null;
  ownerUserId?: string | null;
  goalId?: string | null;
  createdBy: { type: 'user' | 'agent' | 'system'; name: string; id?: string };
}): Promise<Project> {
  const baseKey = normalizeName(input.name).replace(/\s+/g, '-').slice(0, 48) || 'project';
  let key = baseKey;
  let n = 2;
  while (await ProjectModel.exists({ orgId, key })) key = `${baseKey}-${n++}`;
  const project = await ProjectModel.create({
    orgId,
    key,
    name: input.name.trim(),
    description: input.description,
    category: input.category ?? 'general',
    dueDate: input.dueDate ?? undefined,
    startDate: input.startDate ?? undefined,
    ownerUserId: input.ownerUserId ?? undefined,
    goalId: input.goalId ?? undefined,
    status: 'active',
    health: 'on_track',
  });
  if (input.ownerUserId) await ProjectMembershipModel.create({ orgId, projectId: project._id, userId: input.ownerUserId, role: 'lead' });
  await logAudit(orgId, input.createdBy, 'project.created', { type: 'project', id: project._id }, { name: project.name });
  await recordEvent(orgId, 'project.created', { projectId: project._id, name: project.name });
  return project.toObject() as Project;
}

export async function getProject(orgId: string, projectId: string) {
  const project = await ProjectModel.findOne({ orgId, _id: projectId }).lean();
  if (!project) return null;
  const [tasks, milestones, memberships] = await Promise.all([
    TaskModel.find({ orgId, projectId }).lean(),
    MilestoneModel.find({ orgId, projectId }).sort({ dueDate: 1 }).lean(),
    ProjectMembershipModel.find({ orgId, projectId }).lean(),
  ]);
  const members = memberships.length ? await UserModel.find({ orgId, _id: { $in: memberships.map((m) => m.userId) } }).lean() : [];
  const memberById = new Map(members.map((u) => [u._id, u]));
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const overdue = open.filter((t) => t.dueDate && t.dueDate < new Date());
  return {
    ...project,
    id: project._id,
    owner: project.ownerUserId ? (await UserModel.findOne({ orgId, _id: project.ownerUserId }).lean()) ?? null : null,
    milestones,
    members: memberships.map((m) => ({ userId: m.userId, role: m.role, name: memberById.get(m.userId ?? '')?.name ?? 'unknown' })),
    stats: { totalTasks: tasks.length, openTasks: open.length, doneTasks: tasks.length - open.length, overdueTasks: overdue.length, blockedTasks: tasks.filter((t) => t.status === 'blocked').length },
  };
}

export async function searchProjects(orgId: string, opts: { query?: string; status?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const q: Record<string, unknown> = { orgId };
  if (opts.status) q.status = opts.status;
  if (opts.query) {
    const rx = new RegExp(opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { key: rx }, { description: rx }];
  }
  const projects = await ProjectModel.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  return projects.map((p) => ({ ...p, id: p._id }));
}

export async function updateProject(orgId: string, projectId: string, patch: Record<string, unknown>, actor: { type: 'user' | 'agent' | 'system'; name: string }) {
  const allowed = ['name', 'description', 'category', 'status', 'health', 'startDate', 'dueDate', 'ownerUserId'];
  const set: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) set[k] = patch[k];
  const project = await ProjectModel.findOneAndUpdate({ orgId, _id: projectId }, { $set: set }, { new: true }).lean();
  if (project) await logAudit(orgId, actor, 'project.updated', { type: 'project', id: projectId }, patch);
  return project ? { ...project, id: project._id } : null;
}

/** Timeline = milestones + dated tasks, merged and sorted. */
export async function getProjectTimeline(orgId: string, projectId: string) {
  const [milestones, tasks] = await Promise.all([
    MilestoneModel.find({ orgId, projectId }).lean(),
    TaskModel.find({ orgId, projectId, dueDate: { $ne: null } }).lean(),
  ]);
  const items = [
    ...milestones.map((m) => ({ kind: 'milestone' as const, id: m._id, title: m.name, date: m.dueDate, status: m.status })),
    ...tasks.map((t) => ({ kind: 'task' as const, id: t._id, title: t.title, date: t.dueDate, status: t.status })),
  ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
  return items;
}

/** Compute and persist project health from tasks + milestones. Never fabricated — pure derivation. */
export async function getProjectHealth(orgId: string, projectId: string) {
  const project = await ProjectModel.findOne({ orgId, _id: projectId }).lean();
  if (!project) return null;
  const now = new Date();
  const tasks = await TaskModel.find({ orgId, projectId }).lean();
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
  const blocked = open.filter((t) => t.status === 'blocked');
  const deadlineSlip = project.dueDate && project.dueDate < now && open.length > 0;

  let health: 'on_track' | 'at_risk' | 'off_track' = 'on_track';
  const reasons: string[] = [];
  if (deadlineSlip) { health = 'off_track'; reasons.push('project due date passed with open tasks'); }
  if (blocked.length >= 2) { health = 'off_track'; reasons.push(`${blocked.length} blocked tasks`); }
  else if (blocked.length === 1) { health = health === 'on_track' ? 'at_risk' : health; reasons.push('1 blocked task'); }
  if (overdue.length >= 3) { health = 'off_track'; reasons.push(`${overdue.length} overdue tasks`); }
  else if (overdue.length > 0) { health = health === 'on_track' ? 'at_risk' : health; reasons.push(`${overdue.length} overdue task(s)`); }

  await ProjectModel.updateOne({ orgId, _id: projectId }, { $set: { health } });
  return { projectId, health, reasons, openTasks: open.length, overdueTasks: overdue.length, blockedTasks: blocked.length };
}

export async function listGoals(orgId: string) {
  const goals = await GoalModel.find({ orgId, status: 'active' }).lean();
  return goals.map((g) => ({ ...g, id: g._id }));
}
