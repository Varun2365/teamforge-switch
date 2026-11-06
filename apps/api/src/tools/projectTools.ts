import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import * as projects from '../services/projectService.js';

export function registerProjectTools(reg: ToolRegistry) {
  reg.register({
    name: 'create_project',
    description: 'Create a project with a unique key, category and optional owner/goal/due date.',
    tier: 'write',
    input: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      category: z.string().default('general'),
      dueDate: z.string().datetime().optional().nullable(),
      startDate: z.string().datetime().optional().nullable(),
      ownerUserId: z.string().optional().nullable(),
      goalId: z.string().optional().nullable(),
    }),
    handler: ({ orgId, actor }, input) =>
      projects.createProject(orgId, {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        createdBy: actor,
      }) as Promise<unknown>,
  });

  reg.register({
    name: 'get_project',
    description: 'Full project detail: milestones, members, task stats, health.',
    tier: 'read',
    input: z.object({ projectId: z.string() }),
    handler: ({ orgId }, { projectId }) => projects.getProject(orgId, projectId),
  });

  reg.register({
    name: 'search_projects',
    description: 'Search projects by name/key/description, optionally by status.',
    tier: 'read',
    input: z.object({ query: z.string().optional(), status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(), limit: z.number().int().min(1).max(50).optional() }),
    handler: ({ orgId }, input) => projects.searchProjects(orgId, input),
  });

  reg.register({
    name: 'update_project',
    description: 'Update project fields (name, description, category, status, health, dates, owner).',
    tier: 'write',
    input: z.object({
      projectId: z.string(),
      patch: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
        health: z.enum(['on_track', 'at_risk', 'off_track']).optional(),
        startDate: z.string().datetime().optional(),
        dueDate: z.string().datetime().optional(),
        ownerUserId: z.string().optional(),
      }),
    }),
    handler: ({ orgId, actor }, { projectId, patch }) => projects.updateProject(orgId, projectId, patch as Record<string, unknown>, actor),
  });

  reg.register({
    name: 'get_project_timeline',
    description: 'Merged, sorted timeline of milestones and dated tasks for a project.',
    tier: 'read',
    input: z.object({ projectId: z.string() }),
    handler: ({ orgId }, { projectId }) => projects.getProjectTimeline(orgId, projectId),
  });

  reg.register({
    name: 'get_project_health',
    description: 'Computed health for a project: on_track / at_risk / off_track, with the reasons (derived from real task data, never asserted).',
    tier: 'read',
    input: z.object({ projectId: z.string() }),
    handler: ({ orgId }, { projectId }) => projects.getProjectHealth(orgId, projectId),
  });
}
