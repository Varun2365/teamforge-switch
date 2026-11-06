/** Six TEAMFORGE agents, their Switch names and their tool scoping (subset of the API registry). */
export const AGENT_KEYS = [
  'operations-manager',
  'project-manager',
  'knowledge-memory',
  'communication',
  'research-strategy',
  'quality-risk',
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export interface AgentCatalogEntry {
  key: AgentKey;
  name: string;
  switchName: string;
  role: string;
  color: string;
  description: string;
  tools: string[];
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    key: 'operations-manager', name: 'Operations Manager', switchName: 'ops-manager', role: 'Primary coordinator', color: '#0f5c46',
    description: 'Chief AI teammate. Understands the room, pulls organizational context, delegates to specialists through Switch, and returns one coordinated answer.',
    tools: ['get_organization_profile', 'get_departments', 'get_teams', 'get_team_members', 'get_employee_profile', 'get_employee_skills', 'get_organization_overview', 'search_organization_memory', 'search_employees', 'search_projects', 'get_project', 'get_project_health', 'search_tasks', 'get_task', 'get_task_dependencies', 'get_overdue_tasks', 'get_upcoming_deadlines', 'propose_task', 'create_task', 'create_approval_request', 'create_reminder', 'record_handoff', 'record_decision'],
  },
  {
    key: 'project-manager', name: 'Project Manager', switchName: 'project-manager', role: 'Planning and delivery', color: '#1d4ed8',
    description: 'Turns objectives into proposed tasks, owners, milestones and dependencies. Tracks delivery health and stalled work.',
    tools: ['create_project', 'update_project', 'search_projects', 'get_project', 'get_project_health', 'get_project_timeline', 'search_employees', 'get_employee_workload', 'propose_task', 'create_task', 'get_task', 'update_task', 'assign_task', 'complete_task', 'create_task_dependency', 'get_task_dependencies', 'get_overdue_tasks', 'propose_reassignment', 'propose_deadline_change', 'create_reminder', 'record_handoff'],
  },
  {
    key: 'knowledge-memory', name: 'Knowledge & Memory', switchName: 'knowledge-memory', role: 'Organizational memory', color: '#6d28d9',
    description: 'Maintains the temporal knowledge graph. Resolves people and aliases, proposes facts and relationships, preserves history, flags contradictions.',
    tools: ['search_organization_memory', 'find_entity', 'get_entity', 'get_entity_relationships', 'get_entity_history', 'get_fact_history', 'propose_memory_update', 'confirm_memory_update', 'correct_memory', 'record_event', 'record_decision', 'search_employees'],
  },
  {
    key: 'communication', name: 'Communication & Coordination', switchName: 'communication', role: 'Follow-ups and updates', color: '#b45309',
    description: 'Collects status, drafts internal and external messages, follows up on open questions, packages meeting outcomes. External sends require approval.',
    tools: ['request_status_update', 'create_follow_up', 'create_reminder', 'update_reminder', 'cancel_reminder', 'schedule_recurring_followup', 'create_approval_request', 'get_pending_approvals', 'get_upcoming_deadlines', 'record_handoff', 'record_decision', 'search_tasks', 'search_employees'],
  },
  {
    key: 'research-strategy', name: 'Research & Strategy', switchName: 'research-strategy', role: 'Evidence and options', color: '#0e7490',
    description: 'Frames business questions, gathers evidence available in memory, compares options, and separates sourced facts from assumptions.',
    tools: ['search_organization_memory', 'search_projects', 'get_project', 'get_organization_overview', 'get_departments', 'get_teams', 'get_employee_profile', 'get_employee_skills', 'search_tasks', 'search_employees', 'record_decision'],
  },
  {
    key: 'quality-risk', name: 'Quality & Risk', switchName: 'quality-risk', role: 'Risk and dependencies', color: '#b91c1c',
    description: 'Find overdue work, blockers, conflicting deadlines and downstream impact. Recommends corrective actions and escalates material risk.',
    tools: ['analyze_project_risks', 'find_blocked_tasks', 'get_affected_dependencies', 'get_overdue_tasks', 'generate_project_health_report', 'get_task', 'get_task_dependencies', 'propose_deadline_change', 'create_approval_request', 'search_tasks', 'record_handoff'],
  },
];

export function agentByKey(key: string): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((a) => a.key === key);
}
export function isAgentKey(value: string): value is AgentKey {
  return AGENT_CATALOG.some((a) => a.key === value);
}

/** Names as registered on the server (suffix keeps TEAMFORGE separate from any earlier build on the same server). */
export function switchNameFor(key: AgentKey, suffix: string): string {
  const entry = agentByKey(key);
  return `${entry?.switchName ?? key}${suffix}`;
}
