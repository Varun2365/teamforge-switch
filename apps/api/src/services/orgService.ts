import { OrganizationModel, DepartmentModel, TeamModel, TeamMembershipModel, UserModel, EmployeeProfileModel, SkillModel, EmployeeSkillModel } from '../db/models/org.js';
import { TaskModel, TaskAssignmentModel, ProjectModel } from '../db/models/ops.js';
import { normalizeName } from '@teamforge/shared';

export async function getOrganizationProfile(orgId: string) {
  const org = await OrganizationModel.findById(orgId).lean();
  if (!org) return null;
  return {
    id: org._id,
    name: org.name,
    slug: org.slug,
    timezone: org.settings?.timezone,
    quietHours: { start: org.settings?.quietHoursStart, end: org.settings?.quietHoursEnd },
    maxProactivePerDay: org.settings?.maxProactivePerDay,
    proactive: org.settings?.proactive,
    terminology: org.settings?.terminology ?? {},
  };
}

export async function getDepartments(orgId: string) {
  const deps = await DepartmentModel.find({ orgId }).sort({ name: 1 }).lean();
  return deps.map((d) => ({ id: d._id, name: d.name, description: d.description, parentDepartmentId: d.parentDepartmentId }));
}

export async function getTeams(orgId: string) {
  const teams = await TeamModel.find({ orgId }).sort({ name: 1 }).lean();
  const memberships = await TeamMembershipModel.find({ orgId }).lean();
  return teams.map((t) => ({
    id: t._id,
    name: t.name,
    description: t.description,
    departmentId: t.departmentId,
    memberUserIds: memberships.filter((m) => m.teamId === t._id).map((m) => m.userId),
  }));
}

export async function getTeamMembers(orgId: string, teamId: string) {
  const memberships = await TeamMembershipModel.find({ orgId, teamId }).lean();
  const userIds = memberships.map((m) => m.userId);
  const users = await UserModel.find({ orgId, _id: { $in: userIds } }).lean();
  const profiles = await EmployeeProfileModel.find({ orgId, userId: { $in: userIds } }).lean();
  const byId = new Map(users.map((u) => [u._id, u]));
  const profileById = new Map(profiles.map((p) => [p.userId, p]));
  return memberships.map((m) => ({
    membershipRole: m.role,
    user: byId.get(m.userId ?? '') ? { id: m.userId, name: byId.get(m.userId ?? '')!.name, role: byId.get(m.userId ?? '')!.role, title: profileById.get(m.userId ?? '')?.title ?? null } : null,
  }));
}

export async function getEmployeeProfile(orgId: string, userId: string) {
  const user = await UserModel.findOne({ orgId, _id: userId }).lean();
  if (!user) return null;
  const profile = await EmployeeProfileModel.findOne({ orgId, userId }).lean();
  const department = profile?.departmentId ? await DepartmentModel.findOne({ orgId, _id: profile.departmentId }).lean() : null;
  const manager = profile?.managerUserId ? await UserModel.findOne({ orgId, _id: profile.managerUserId }).lean() : null;
  const skills = await getEmployeeSkills(orgId, userId);
  const workload = await getEmployeeWorkload(orgId, userId);
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    title: profile?.title ?? null,
    location: profile?.location ?? null,
    joinedAt: profile?.joinedAt ?? null,
    department: department ? { id: department._id, name: department.name } : null,
    reportsTo: manager ? { id: manager._id, name: manager.name } : null,
    skills,
    workload,
  };
}

export async function searchEmployees(orgId: string, opts: { query?: string; skill?: string; departmentId?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 20, 50);
  let q: Record<string, unknown> = { orgId, status: { $ne: 'disabled' } };
  if (opts.query) {
    const rx = new RegExp(normalizeName(opts.query).split(' ').filter(Boolean).join('|'), 'i');
    q = { ...q, $or: [{ normalizedName: rx }, { email: rx }] };
  }
  let users = await UserModel.find(q).limit(limit).lean();
  if (opts.departmentId) {
    const profiles = await EmployeeProfileModel.find({ orgId, departmentId: opts.departmentId }).lean();
    const ids = new Set(profiles.map((p) => p.userId));
    users = users.filter((u) => ids.has(u._id));
  }
  if (opts.skill) {
    const skillRx = new RegExp(normalizeName(opts.skill), 'i');
    const skills = await SkillModel.find({ orgId, normalizedName: skillRx }).lean();
    const skillIds = skills.map((s) => s._id);
    const links = await EmployeeSkillModel.find({ orgId, skillId: { $in: skillIds } }).lean();
    const ids = new Set(links.map((l) => l.userId));
    users = users.filter((u) => ids.has(u._id));
  }
  const profiles = await EmployeeProfileModel.find({ orgId, userId: { $in: users.map((u) => u._id) } }).lean();
  const profileById = new Map(profiles.map((p) => [p.userId, p]));
  return users.map((u) => ({ id: u._id, name: u.name, role: u.role, title: profileById.get(u._id)?.title ?? null, email: u.email }));
}

export async function getEmployeeSkills(orgId: string, userId: string) {
  const links = await EmployeeSkillModel.find({ orgId, userId }).lean();
  const skills = await SkillModel.find({ orgId, _id: { $in: links.map((l) => l.skillId) } }).lean();
  const byId = new Map(skills.map((s) => [s._id, s]));
  return links.map((l) => ({
    name: byId.get(l.skillId ?? '')?.name ?? 'unknown',
    category: byId.get(l.skillId ?? '')?.category ?? null,
    level: l.level,
    confirmedBy: l.confirmedBy,
  }));
}

export async function getEmployeeWorkload(orgId: string, userId: string) {
  const assignments = await TaskAssignmentModel.find({ orgId, userId, active: true }).lean();
  const taskIds = assignments.map((a) => a.taskId);
  const tasks = await TaskModel.find({ orgId, _id: { $in: taskIds } }).lean();
  const now = new Date();
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  return {
    activeAssignments: assignments.length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
    capacityNote: open.length >= 6 ? 'Heavy load — consider before assigning more' : open.length >= 3 ? 'Moderate load' : 'Has capacity',
    tasks: open.map((t) => ({ id: t._id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })),
  };
}

export async function getOrganizationOverview(orgId: string) {
  const [activeProjects, totalPeople, openTasks, overdueTasks, blockedTasks, pendingApprovals, recentDecisions] = await Promise.all([
    ProjectModel.countDocuments({ orgId, status: 'active' }),
    UserModel.countDocuments({ orgId, status: 'active' }),
    TaskModel.countDocuments({ orgId, status: { $in: ['todo', 'in_progress', 'blocked'] } }),
    TaskModel.countDocuments({ orgId, status: { $in: ['todo', 'in_progress', 'blocked'] }, dueDate: { $lt: new Date() } }),
    TaskModel.countDocuments({ orgId, status: 'blocked' }),
    import('../db/models/comms.js').then((m) => m.ApprovalModel.countDocuments({ orgId, status: 'pending' })),
    import('../db/models/ops.js').then((m) => m.DecisionModel.find({ orgId, status: 'active' }).sort({ decidedAt: -1 }).limit(5).lean()),
  ]);
  return {
    activeProjects,
    totalPeople,
    openTasks,
    overdueTasks,
    blockedTasks,
    pendingApprovals,
    recentDecisions: (recentDecisions as { title: string; decidedAt: Date }[]).map((d) => ({ title: d.title, decidedAt: d.decidedAt })),
  };
}
