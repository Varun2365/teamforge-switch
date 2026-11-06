import { TaskModel, TaskDependencyModel, ProjectModel } from '../db/models/ops.js';
import { UserModel } from '../db/models/org.js';

export interface RiskFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  recommendation: string;
  relatedTaskIds?: string[];
}

/** Reverse dependency walk: everything that transitively depends on `taskId`. */
export async function getAffectedDependencies(orgId: string, taskId: string, depth = 0, seen = new Set<string>()): Promise<Array<{ taskId: string; title: string; status: string; dueDate: Date | null; depth: number; via: string }>> {
  if (depth > 6) return [];
  const dependents = await TaskDependencyModel.find({ orgId, dependsOnTaskId: taskId }).lean();
  const out: Array<{ taskId: string; title: string; status: string; dueDate: Date | null; depth: number; via: string }> = [];
  for (const dep of dependents) {
    if (seen.has(dep.taskId)) continue;
    seen.add(dep.taskId);
    const task = await TaskModel.findOne({ orgId, _id: dep.taskId }).lean();
    if (task) out.push({ taskId: task._id, title: task.title, status: task.status, dueDate: task.dueDate ?? null, depth: depth + 1, via: taskId });
    out.push(...(await getAffectedDependencies(orgId, dep.taskId, depth + 1, seen)));
  }
  return out;
}

export async function findBlockedTasks(orgId: string, projectId?: string) {
  const q: Record<string, unknown> = { orgId, status: 'blocked' };
  if (projectId) q.projectId = projectId;
  const tasks = await TaskModel.find(q).lean();
  const deps = await TaskDependencyModel.find({ orgId, taskId: { $in: tasks.map((t) => t._id) } }).lean();
  const depTaskIds = [...new Set(deps.map((d) => d.dependsOnTaskId))];
  const depTasks = await TaskModel.find({ orgId, _id: { $in: depTaskIds } }).lean();
  const depById = new Map(depTasks.map((t) => [t._id, t]));
  return tasks.map((t) => ({
    ...t,
    id: t._id,
    waitingOn: deps.filter((d) => d.taskId === t._id).map((d) => ({ id: d.dependsOnTaskId, title: depById.get(d.dependsOnTaskId)?.title ?? 'unknown', status: depById.get(d.dependsOnTaskId)?.status ?? 'unknown' })),
  }));
}

export async function analyzeProjectRisks(orgId: string, projectId: string): Promise<{ risks: RiskFinding[]; health: 'on_track' | 'at_risk' | 'off_track'; score: number }> {
  const project = await ProjectModel.findOne({ orgId, _id: projectId }).lean();
  if (!project) throw new Error('Project not found');
  const now = new Date();
  const tasks = await TaskModel.find({ orgId, projectId }).lean();
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const risks: RiskFinding[] = [];

  const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
  for (const t of overdue) {
    const days = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000);
    const affected = await getAffectedDependencies(orgId, t._id);
    risks.push({
      severity: days > 3 || affected.some((a) => a.status !== 'done') ? 'high' : 'medium',
      title: `Overdue: ${t.title}`,
      detail: `${days} day(s) overdue; ${affected.length} downstream task(s) affected${affected.length ? ` (${affected.map((a) => a.title).slice(0, 3).join(', ')}${affected.length > 3 ? '…' : ''})` : ''}.`,
      recommendation: affected.length
        ? 'Get an updated ETA today; if it slips, renegotiate dependent deadlines in parallel rather than serially.'
        : 'Ask for a short update and a revised date, or reassign if the owner is overloaded.',
      relatedTaskIds: [t._id, ...affected.map((a) => a.taskId)],
    });
  }

  const blocked = open.filter((t) => t.status === 'blocked');
  for (const t of blocked) {
    const deps = await TaskDependencyModel.find({ orgId, taskId: t._id }).lean();
    const depTasks = await TaskModel.find({ orgId, _id: { $in: deps.map((d) => d.dependsOnTaskId) } }).lean();
    const unfinished = depTasks.filter((d) => d.status !== 'done' && d.status !== 'cancelled');
    risks.push({
      severity: unfinished.length ? 'high' : 'medium',
      title: `Blocked: ${t.title}`,
      detail: unfinished.length ? `Waiting on: ${unfinished.map((d) => d.title).join(', ')}` : 'Marked blocked without an unfinished dependency — worth a manual check.',
      recommendation: 'Unblock the dependency or drop the block flag; a stale "blocked" hides real work.',
      relatedTaskIds: [t._id, ...unfinished.map((d) => d._id)],
    });
  }

  // Unowned work
  const { TaskAssignmentModel } = await import('../db/models/ops.js');
  const assignedIds = new Set((await TaskAssignmentModel.find({ orgId, active: true }).lean()).map((a) => a.taskId));
  const unowned = open.filter((t) => !assignedIds.has(t._id));
  if (unowned.length) {
    risks.push({
      severity: 'medium',
      title: `${unowned.length} unowned task(s)`,
      detail: unowned.slice(0, 4).map((t) => t.title).join(' · ') + (unowned.length > 4 ? '…' : ''),
      recommendation: 'Assign owners — unowned tasks silently become everyone\'s and no one\'s.',
      relatedTaskIds: unowned.map((t) => t._id),
    });
  }

  if (project.dueDate && project.dueDate < now && open.length) {
    risks.push({
      severity: 'critical',
      title: 'Project deadline passed with open work',
      detail: `${open.length} task(s) still open past the ${new Date(project.dueDate).toDateString()} deadline.`,
      recommendation: 'Reset expectations with stakeholders today: either descope, extend with a new date, or escalate resourcing.',
    });
  }

  const score = risks.reduce((acc, r) => acc + { low: 1, medium: 3, high: 7, critical: 15 }[r.severity], 0);
  const health: 'on_track' | 'at_risk' | 'off_track' = risks.some((r) => r.severity === 'critical') || score >= 14 ? 'off_track' : score >= 5 ? 'at_risk' : 'on_track';
  return { risks, health, score };
}

export async function generateProjectHealthReport(orgId: string, projectId: string) {
  const { getProject } = await import('./projectService.js');
  const project = await getProject(orgId, projectId);
  if (!project) throw new Error('Project not found');
  const { risks, health, score } = await analyzeProjectRisks(orgId, projectId);
  const blocked = await findBlockedTasks(orgId, projectId);
  return {
    project: { id: project.id, name: project.name, status: project.status, dueDate: project.dueDate, health },
    stats: project.stats,
    riskScore: score,
    risks,
    blocked,
    generatedAt: new Date().toISOString(),
    generatedFor: 'team and stakeholders',
  };
}

export async function summarizeWorkloadForUser(orgId: string, userId: string) {
  const user = await UserModel.findOne({ orgId, _id: userId }).lean();
  const { getEmployeeWorkload } = await import('./orgService.js');
  const workload = await getEmployeeWorkload(orgId, userId);
  return { user: user ? { id: user._id, name: user.name } : null, ...workload };
}
