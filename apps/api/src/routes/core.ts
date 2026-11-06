import type { FastifyInstance } from 'fastify';
import { getOrganizationGraph } from '../services/graphService.js';
import { dbPing } from '../db/connection.js';
import { config } from '../config.js';
import { OrganizationModel, DepartmentModel, TeamModel, UserModel, EmployeeProfileModel } from '../db/models/org.js';
import { ProjectModel, TaskModel, TaskAssignmentModel, DecisionModel } from '../db/models/ops.js';
import { ApprovalModel, AgentActionModel, NotificationModel } from '../db/models/comms.js';
import { getOrganizationProfile, getOrganizationOverview } from '../services/orgService.js';
import { getUpcomingDeadlines } from '../services/reminderService.js';
import { logAudit } from '../services/audit.js';

export async function coreRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const mongo = await dbPing();
    return {
      status: mongo ? 'ok' : 'degraded',
      service: 'teamforge-api',
      version: '1.0.0',
      mongo: mongo ? 'connected' : 'unavailable',
      uptimeSeconds: Math.round(process.uptime()),
      org: config.ORG_SLUG,
      demoMode: config.TEAMFORGE_DEMO_MODE,
      switchServer: config.SWITCH_SERVER_URL,
    };
  });

  app.get('/api/overview', async (req) => {
    const { orgId } = req.auth;
    const [profile, overview, projects, recentDecisions, activity, upcoming, notifications] = await Promise.all([
      getOrganizationProfile(orgId),
      getOrganizationOverview(orgId),
      ProjectModel.find({ orgId, status: 'active' }).lean(),
      DecisionModel.find({ orgId, status: 'active' }).sort({ decidedAt: -1 }).limit(5).lean(),
      AgentActionModel.find({ orgId }).sort({ at: -1 }).limit(12).lean(),
      getUpcomingDeadlines(orgId, 7, 10),
      NotificationModel.find({ orgId }).sort({ at: -1 }).limit(10).lean(),
    ]);
    const now = new Date();
    const projectCards = await Promise.all(
      projects.map(async (p) => {
        const open = await TaskModel.countDocuments({ orgId, projectId: p._id, status: { $nin: ['done', 'cancelled'] } });
        const overdue = await TaskModel.countDocuments({ orgId, projectId: p._id, status: { $nin: ['done', 'cancelled'] }, dueDate: { $lt: now } });
        return { id: p._id, name: p.name, health: p.health, dueDate: p.dueDate, openTasks: open, overdueTasks: overdue };
      }),
    );
    return {
      profile,
      ...overview,
      projects: projectCards,
      recentDecisions: recentDecisions.map((d) => ({ id: d._id, title: d.title, summary: d.summary, decidedAt: d.decidedAt, decidedBy: d.decidedBy })),
      upcomingDeadlines: upcoming,
      agentActivity: activity.map((a) => ({ id: a._id, agent: a.agent, action: a.action, outputSummary: a.outputSummary, at: a.at, demo: a.demo, error: a.error })),
      notifications: notifications.map((n) => ({ id: n._id, title: n.title, body: n.body, kind: n.kind, status: n.status, demo: n.demo, at: n.at })),
    };
  });

  app.get('/api/graph', async (req) => getOrganizationGraph(req.auth.orgId));

  app.get('/api/organizations/current', async (req) => getOrganizationProfile(req.auth.orgId));

  app.get('/api/departments', async (req) => DepartmentModel.find({ orgId: req.auth.orgId }).sort({ name: 1 }).lean());

  app.get('/api/teams', async (req) => TeamModel.find({ orgId: req.auth.orgId }).sort({ name: 1 }).lean());

  app.get('/api/people', async (req) => {
    const { orgId } = req.auth;
    const { q, departmentId } = req.query as { q?: string; departmentId?: string };
    const filter: Record<string, unknown> = { orgId, status: { $ne: 'disabled' } };
    if (q) filter.$or = [{ normalizedName: { $regex: q.toLowerCase() } }, { email: { $regex: q.toLowerCase() } }];
    let users = await UserModel.find(filter).lean();
    const profiles = await EmployeeProfileModel.find({ orgId, userId: { $in: users.map((u) => u._id) } }).lean();
    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    if (departmentId) users = users.filter((u) => profileById.get(u._id)?.departmentId === departmentId);
    const assignments = await TaskAssignmentModel.find({ orgId, active: true, userId: { $in: users.map((u) => u._id) } }).lean();
    const counts = new Map<string, number>();
    for (const a of assignments) counts.set(a.userId ?? '', (counts.get(a.userId ?? '') ?? 0) + 1);
    const depts = await DepartmentModel.find({ orgId }).lean();
    const deptById = new Map(depts.map((d) => [d._id, d.name]));
    return users.map((u) => {
      const p = profileById.get(u._id);
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: p?.title ?? null,
        department: p?.departmentId ? deptById.get(p.departmentId) ?? null : null,
        departmentId: p?.departmentId ?? null,
        managerUserId: p?.managerUserId ?? null,
        activeAssignments: counts.get(u._id) ?? 0,
        joinedAt: p?.joinedAt ?? null,
        location: p?.location ?? null,
      };
    });
  });

  app.get('/api/people/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { getEmployeeProfile } = await import('../services/orgService.js');
    const profile = await getEmployeeProfile(req.auth.orgId, id);
    if (!profile) return reply.code(404).send({ error: { code: 'not_found', message: 'Person not found' } });
    return profile;
  });

  app.patch('/api/people/:id', async (req) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    const { orgId } = req.auth;
    const allowed = ['title', 'departmentId', 'managerUserId', 'location', 'joinedAt', 'bio'];
    const set: Record<string, unknown> = {};
    for (const k of allowed) if (k in patch) set[k] = patch[k];
    await EmployeeProfileModel.updateOne({ orgId, userId: id }, { $set: set }, { upsert: true });
    if (typeof patch.role === 'string') await UserModel.updateOne({ orgId, _id: id }, { $set: { role: patch.role } });
    await logAudit(orgId, req.auth.actor, 'person.updated', { type: 'user', id }, patch);
    const { getEmployeeProfile } = await import('../services/orgService.js');
    return getEmployeeProfile(orgId, id);
  });
}
