/** Public-facing enums shared between api and web. Keep loose — orgs can extend values. */

export const USER_ROLES = ['owner', 'administrator', 'manager', 'team_lead', 'employee', 'external'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export const PROJECT_HEALTH = ['on_track', 'at_risk', 'off_track'] as const;

export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];
export const TASK_DEPENDENCY_KIND = ['blocks', 'needed_by'] as const;
export type TaskDependencyKind = (typeof TASK_DEPENDENCY_KIND)[number];

export const FACT_STATUS = ['active', 'proposed', 'superseded', 'disputed', 'rejected'] as const;
export type FactStatus = (typeof FACT_STATUS)[number];

export const APPROVAL_STATUS = ['pending', 'approved', 'rejected', 'expired'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const REMINDER_STATUS = ['scheduled', 'sent', 'snoozed', 'cancelled', 'failed'] as const;

export const AGENT_NAMES = [
  'operations-manager',
  'project-manager',
  'knowledge-memory',
  'communication',
  'research-strategy',
  'quality-risk',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_DISPLAY: Record<AgentName, { role: string; tagline: string }> = {
  'operations-manager': { role: 'AI Operations Manager', tagline: 'Coordinates the work and the people' },
  'project-manager': { role: 'Project Manager', tagline: 'Plans, tasks, timelines, milestones' },
  communication: { role: 'Communication & Coordination', tagline: 'Drafts, summaries and follow-ups' },
  'knowledge-memory': { role: 'Knowledge & Memory', tagline: 'The organization’s living memory' },
  'research-strategy': { role: 'Research & Strategy', tagline: 'Grounded research and recommendations' },
  'quality-risk': { role: 'Quality & Risk', tagline: 'Catches what would slip or break' },
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
