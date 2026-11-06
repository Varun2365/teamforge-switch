import type { FastifyInstance } from 'fastify';
import * as tasks from '../services/taskService.js';
import * as projects from '../services/projectService.js';
import * as risk from '../services/riskService.js';
import { logAudit } from '../services/audit.js';
import { ProjectModel } from '../db/models/ops.js';

export async function opsRoutes(app: FastifyInstance) {
  /* Projects */
  app.get('/api/projects', async (req) => {
    const { q, status } = req.query as { q?: string; status?: string };
    return projects.searchProjects(req.auth.orgId, { query: q, status });
  });

  app.post('/api/projects', async (req, reply) => {
    const body = req.body as { name: string; description?: string; category?: string; dueDate?: string; ownerUserId?: string };
    if (!body?.name) return reply.code(400).send({ error: { code: 'bad_request', message: 'name is required' } });
    const project = await projects.createProject(req.auth.orgId, {
      name: body.name,
      description: body.description,
      category: body.category,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      ownerUserId: body.ownerUserId ?? null,
      createdBy: req.auth.actor,
    });
    return reply.code(201).send(project);
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projects.getProject(req.auth.orgId, id);
    if (!project) return reply.code(404).send({ error: { code: 'not_found', message: 'Project not found' } });
    return project;
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projects.updateProject(req.auth.orgId, id, req.body as Record<string, unknown>, req.auth.actor);
    if (!project) return reply.code(404).send({ error: { code: 'not_found', message: 'Project not found' } });
    return project;
  });

  app.get('/api/projects/:id/timeline', async (req) => {
    const { id } = req.params as { id: string };
    return projects.getProjectTimeline(req.auth.orgId, id);
  });

  app.get('/api/projects/:id/health', async (req) => {
    const { id } = req.params as { id: string };
    return risk.generateProjectHealthReport(req.auth.orgId, id);
  });

  /* Tasks */
  app.get('/api/tasks', async (req) => {
    const { projectId, assigneeUserId, status, overdue, q, limit } = req.query as Record<string, string | undefined>;
    return tasks.searchTasks(req.auth.orgId, { projectId, assigneeUserId, status, overdue: overdue === 'true', query: q, limit: limit ? Number(limit) : 50 });
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = req.body as Record<string, unknown> & { title?: string };
    if (!body?.title) return reply.code(400).send({ error: { code: 'bad_request', message: 'title is required' } });
    const task = await tasks.createTask({
      orgId: req.auth.orgId,
      title: body.title,
      description: body.description as string | undefined,
      projectId: (body.projectId as string | undefined) ?? null,
      priority: body.priority as never,
      category: (body.category as string | undefined) ?? 'general',
      tags: (body.tags as string[] | undefined) ?? [],
      dueDate: body.dueDate ? new Date(body.dueDate as string) : null,
      assigneeUserId: (body.assigneeUserId as string | undefined) ?? null,
      reporterUserId: req.auth.actor.id ?? null,
      createdBy: req.auth.actor,
    });
    return reply.code(201).send(task);
  });

  app.get('/api/tasks/overdue', async (req) => {
    const { projectId } = req.query as { projectId?: string };
    return tasks.getOverdueTasks(req.auth.orgId, projectId);
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await tasks.getTask(req.auth.orgId, id);
    if (!task) return reply.code(404).send({ error: { code: 'not_found', message: 'Task not found' } });
    return task;
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await tasks.updateTask(req.auth.orgId, id, req.body as Record<string, unknown>, req.auth.actor);
    if (!task) return reply.code(404).send({ error: { code: 'not_found', message: 'Task not found' } });
    return task;
  });

  app.post('/api/tasks/:id/assign', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) return reply.code(400).send({ error: { code: 'bad_request', message: 'userId is required' } });
    const assignment = await tasks.assignTask(req.auth.orgId, id, userId, req.auth.actor, { method: 'direct', reason });
    return reply.code(201).send(assignment);
  });

  app.post('/api/tasks/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await tasks.completeTask(req.auth.orgId, id, req.auth.actor);
    if (!task) return reply.code(404).send({ error: { code: 'not_found', message: 'Task not found' } });
    return task;
  });

  app.get('/api/tasks/:id/dependencies', async (req) => {
    const { id } = req.params as { id: string };
    return tasks.getTaskDependencies(req.auth.orgId, id);
  });

  app.post('/api/tasks/:id/dependencies', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { dependsOnTaskId, kind } = req.body as { dependsOnTaskId?: string; kind?: 'blocks' | 'needed_by' };
    if (!dependsOnTaskId) return reply.code(400).send({ error: { code: 'bad_request', message: 'dependsOnTaskId is required' } });
    try {
      const result = await tasks.createTaskDependency(req.auth.orgId, id, dependsOnTaskId, kind ?? 'blocks', req.auth.actor);
      return reply.code(201).send(result);
    } catch (err) {
      return reply.code(409).send({ error: { code: 'conflict', message: err instanceof Error ? err.message : String(err) } });
    }
  });

  /* Risks */
  app.get('/api/risks', async (req) => {
    const { projectId } = req.query as { projectId?: string };
    if (projectId) return risk.analyzeProjectRisks(req.auth.orgId, projectId);
    const { orgId } = req.auth;
    const active = await ProjectModel.find({ orgId, status: 'active' }).lean();
    const all = await Promise.all(active.map((p) => risk.analyzeProjectRisks(orgId, p._id).then((r) => ({ projectId: p._id, projectName: p.name, ...r }))));
    return all;
  });
}
