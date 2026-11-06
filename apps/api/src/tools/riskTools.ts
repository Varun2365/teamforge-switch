import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import * as risk from '../services/riskService.js';

export function registerRiskTools(reg: ToolRegistry) {
  reg.register({
    name: 'analyze_project_risks',
    description: 'Derive project risks from real data: overdue tasks with downstream blast radius, blocked chains, unowned work, passed deadlines. Returns findings with severity and recommendations.',
    tier: 'read',
    input: z.object({ projectId: z.string() }),
    handler: ({ orgId }, { projectId }) => risk.analyzeProjectRisks(orgId, projectId),
  });

  reg.register({
    name: 'find_blocked_tasks',
    description: 'All blocked tasks and exactly what each is waiting on.',
    tier: 'read',
    input: z.object({ projectId: z.string().optional() }),
    handler: ({ orgId }, { projectId }) => risk.findBlockedTasks(orgId, projectId),
  });

  reg.register({
    name: 'get_affected_dependencies',
    description: 'Everything that transitively depends on a task — the blast radius if it slips or breaks.',
    tier: 'read',
    input: z.object({ taskId: z.string() }),
    handler: ({ orgId }, { taskId }) => risk.getAffectedDependencies(orgId, taskId),
  });

  reg.register({
    name: 'generate_project_health_report',
    description: 'Full health report for a project: computed health, stats, risk findings, blocked list. Grounded in stored data.',
    tier: 'read',
    input: z.object({ projectId: z.string() }),
    handler: ({ orgId }, { projectId }) => risk.generateProjectHealthReport(orgId, projectId),
  });
}
