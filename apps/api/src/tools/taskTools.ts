import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import * as tasks from '../services/taskService.js';
import { TaskModel, TaskAssignmentModel } from '../db/models/ops.js';
import { UserModel, EmployeeSkillModel, SkillModel } from '../db/models/org.js';
import { createApprovalRequest } from '../services/approvalService.js';
import { normalizeName } from '@teamforge/shared';

export function registerTaskTools(reg: ToolRegistry) {
  reg.register({
    name: 'propose_task',
    description: 'Preview a task before creating it: duplicate candidates, recommended assignee by confirmed skills and current load, warnings. Does NOT create anything.',
    tier: 'read',
    input: z.object({
      title: z.string().min(3),
      projectId: z.string().optional(),
      requiredSkills: z.array(z.string()).default([]),
      candidateAssigneeName: z.string().optional(),
    }),
    handler: async ({ orgId }, input) => {
      // Duplicate detection — token-overlap on open tasks
      const open = await TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] } }).limit(200).lean();
      const norm = normalizeName(input.title);
      const titleTokens = new Set(norm.split(' ').filter((w) => w.length > 2));
      const duplicates = open
        .map((t) => {
          const tt = new Set(normalizeName(t.title).split(' ').filter((w) => w.length > 2));
          let inter = 0;
          for (const w of titleTokens) if (tt.has(w)) inter++;
          return { task: { id: t._id, title: t.title, status: t.status }, overlap: titleTokens.size ? inter / titleTokens.size : 0 };
        })
        .filter((d) => d.overlap >= 0.6)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 3);

      // Assignee recommendation by confirmed skills, then lightest load
      let recommendation: null | { userId: string; name: string; reasons: string[]; load: string } = null;
      const skillNames = input.requiredSkills.map(normalizeName).filter(Boolean);
      if (skillNames.length) {
        const skills = await SkillModel.find({ orgId, normalizedName: { $in: skillNames } }).lean();
        const links = await EmployeeSkillModel.find({ orgId, skillId: { $in: skills.map((s) => s._id) } }).lean();
        const byUser = new Map<string, number>();
        for (const l of links) byUser.set(l.userId ?? '', (byUser.get(l.userId ?? '') ?? 0) + 1);
        const ranked = [...byUser.entries()].sort((a, b) => b[1] - a[1]);
        for (const [userId, matchCount] of ranked) {
          const user = await UserModel.findOne({ orgId, _id: userId }).lean();
          const { getEmployeeWorkload } = await import('../services/orgService.js');
          const load = await getEmployeeWorkload(orgId, userId);
          if (user && load.overdue === 0 && load.capacityNote !== 'Heavy load — consider before assigning more') {
            recommendation = {
              userId,
              name: user.name,
              reasons: [`Confirmed skills match ${matchCount}/${skillNames.length} required`, `Workload: ${load.capacityNote}`],
              load: load.capacityNote,
            };
            break;
          }
        }
      }
      const warnings: string[] = [];
      if (duplicates.length) warnings.push(`Possible duplicate of: ${duplicates.map((d) => d.task.title).join(' · ')}`);
      if (!recommendation) warnings.push('No confident assignee recommendation — ask the room, or create unassigned.');
      return { input, duplicates, recommendation, warnings };
    },
  });

  reg.register({
    name: 'create_task',
    description: 'Create a task. Optionally assign it. Assignments by agents through this tool also record a direct assignment; use propose_task first for recommendations.',
    tier: 'write',
    input: z.object({
      title: z.string().min(3),
      description: z.string().optional(),
      projectId: z.string().optional().nullable(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      category: z.string().default('general'),
      tags: z.array(z.string()).default([]),
      dueDate: z.string().datetime().optional().nullable(),
      assigneeUserId: z.string().optional().nullable(),
      reporterUserId: z.string().optional().nullable(),
      reason: z.string().optional(),
    }),
    handler: ({ orgId, actor }, input) =>
      tasks.createTask({
        orgId,
        title: input.title,
        description: input.description,
        projectId: input.projectId ?? null,
        priority: input.priority,
        category: input.category,
        tags: input.tags,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assigneeUserId: input.assigneeUserId ?? null,
        reporterUserId: input.reporterUserId ?? null,
        createdBy: actor,
        method: input.assigneeUserId ? 'recommended' : undefined,
        reason: input.reason,
      }) as Promise<unknown>,
  });

  reg.register({
    name: 'get_task',
    description: 'Task detail including active assignees.',
    tier: 'read',
    input: z.object({ taskId: z.string() }),
    handler: ({ orgId }, { taskId }) => tasks.getTask(orgId, taskId),
  });

  reg.register({
    name: 'search_tasks',
    description: 'Search tasks with filters (project, assignee, status, overdue, free text).',
    tier: 'read',
    input: z.object({
      projectId: z.string().optional(),
      assigneeUserId: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
      overdue: z.boolean().optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: ({ orgId }, input) => tasks.searchTasks(orgId, input),
  });

  reg.register({
    name: 'update_task',
    description: 'Update task fields (title, description, status, priority, dueDate, category, tags, project).',
    tier: 'write',
    input: z.object({
      taskId: z.string(),
      patch: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().datetime().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        projectId: z.string().optional(),
      }),
    }),
    handler: ({ orgId, actor }, { taskId, patch }) => tasks.updateTask(orgId, taskId, patch as Record<string, unknown>, actor) as Promise<unknown>,
  });

  reg.register({
    name: 'assign_task',
    description: 'Assign a task to a person. IMPORTANT: when an agent assigns someone other than itself, this creates an approval request for a human instead of assigning. Human actors (dashboard/API key) assign immediately.',
    tier: 'sensitive',
    input: z.object({
      taskId: z.string(),
      toUserId: z.string(),
      reason: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, { taskId, toUserId, reason }) => {
      const task = await TaskModel.findOne({ orgId, _id: taskId }).lean();
      if (!task) throw new Error('Task not found');
      const assignee = await UserModel.findOne({ orgId, _id: toUserId }).lean();
      if (!assignee) throw new Error('Assignee not found');
      if (actor.type === 'agent') {
        const approval = await createApprovalRequest({
          orgId,
          requesterType: 'agent',
          requesterName: actor.name,
          action: 'assign',
          targetType: 'task',
          targetId: taskId,
          payload: { taskId, toUserId, reason },
          reason: reason ?? `Assign "${task.title}" to ${assignee.name}`,
          impact: 'Task assignment takes effect only after a human approves.',
        });
        return { status: 'approval_required', approvalId: approval._id, taskId, toUserId, detail: `Approval requested — ${assignee.name} will be assigned once a human approves.` };
      }
      const assignment = await tasks.assignTask(orgId, taskId, toUserId, actor, { method: 'direct', reason });
      return { status: 'assigned', assignment };
    },
  });

  reg.register({
    name: 'get_task_dependencies',
    description: 'What this task depends on, and what depends on it.',
    tier: 'read',
    input: z.object({ taskId: z.string() }),
    handler: ({ orgId }, { taskId }) => tasks.getTaskDependencies(orgId, taskId),
  });

  reg.register({
    name: 'create_task_dependency',
    description: 'Declare that one task depends on another (with cycle detection).',
    tier: 'write',
    input: z.object({
      taskId: z.string(),
      dependsOnTaskId: z.string(),
      kind: z.enum(['blocks', 'needed_by']).default('blocks'),
    }),
    handler: ({ orgId, actor }, { taskId, dependsOnTaskId, kind }) => tasks.createTaskDependency(orgId, taskId, dependsOnTaskId, kind, actor),
  });

  reg.register({
    name: 'complete_task',
    description: 'Mark a task done; linked commitments auto-close; dependents are notified via events.',
    tier: 'write',
    input: z.object({ taskId: z.string() }),
    handler: ({ orgId, actor }, { taskId }) => tasks.completeTask(orgId, taskId, actor) as Promise<unknown>,
  });

  reg.register({
    name: 'get_overdue_tasks',
    description: 'All tasks past due (not done/cancelled), with assignees and days overdue. Optionally scoped to a project.',
    tier: 'read',
    input: z.object({ projectId: z.string().optional() }),
    handler: ({ orgId }, { projectId }) => tasks.getOverdueTasks(orgId, projectId),
  });
}
