import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import * as org from '../services/orgService.js';

export function registerOrgTools(reg: ToolRegistry) {
  reg.register({
    name: 'get_organization_profile',
    description: 'Get the organization profile: name, timezone, quiet hours, proactive settings, custom terminology.',
    tier: 'read',
    input: z.object({}),
    handler: ({ orgId }) => org.getOrganizationProfile(orgId) as Promise<unknown>,
  });

  reg.register({
    name: 'get_departments',
    description: 'List all departments in the organization.',
    tier: 'read',
    input: z.object({}),
    handler: ({ orgId }) => org.getDepartments(orgId),
  });

  reg.register({
    name: 'get_teams',
    description: 'List all teams and their member user ids.',
    tier: 'read',
    input: z.object({}),
    handler: ({ orgId }) => org.getTeams(orgId),
  });

  reg.register({
    name: 'get_team_members',
    description: 'List members of a team with their roles and titles.',
    tier: 'read',
    input: z.object({ teamId: z.string().describe('The team id') }),
    handler: ({ orgId }, { teamId }) => org.getTeamMembers(orgId, teamId),
  });

  reg.register({
    name: 'get_employee_profile',
    description: 'Full profile of a person: role, title, department, reports-to line, skills, current workload.',
    tier: 'read',
    input: z.object({ userId: z.string().describe('The user id') }),
    handler: ({ orgId }, { userId }) => org.getEmployeeProfile(orgId, userId),
  });

  reg.register({
    name: 'search_employees',
    description: 'Search people by name/email, department or skill. Use skill to answer "who knows X?".',
    tier: 'read',
    input: z.object({
      query: z.string().optional(),
      skill: z.string().optional(),
      departmentId: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    handler: ({ orgId }, input) => org.searchEmployees(orgId, input),
  });

  reg.register({
    name: 'get_employee_skills',
    description: 'List a person\'s confirmed skills with levels.',
    tier: 'read',
    input: z.object({ userId: z.string() }),
    handler: ({ orgId }, { userId }) => org.getEmployeeSkills(orgId, userId),
  });

  reg.register({
    name: 'get_employee_workload',
    description: 'A person\'s current load: open/blocked/in-progress/overdue counts and the actual tasks.',
    tier: 'read',
    input: z.object({ userId: z.string() }),
    handler: ({ orgId }, { userId }) => org.getEmployeeWorkload(orgId, userId),
  });

  reg.register({
    name: 'get_organization_overview',
    description: 'Org-wide pulse: active projects, people, open/overdue/blocked tasks, pending approvals, recent decisions.',
    tier: 'read',
    input: z.object({}),
    handler: ({ orgId }) => org.getOrganizationOverview(orgId),
  });
}
