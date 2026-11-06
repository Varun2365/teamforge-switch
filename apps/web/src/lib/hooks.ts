import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Overview, type Person, type PersonProfile, type Project, type Task, type Entity, type Approval, type AgentAction, type NotificationItem, type SwitchStatus } from './api';

export const keys = {
  overview: ['overview'],
  people: ['people'],
  person: (id: string) => ['person', id],
  projects: ['projects'],
  project: (id: string) => ['project', id],
  tasks: (filter?: unknown) => ['tasks', filter ?? 'all'],
  taskOverdue: ['tasks', 'overdue'],
  memorySearch: (q: string) => ['memory', q],
  entity: (id: string) => ['entity', id],
  approvals: ['approvals'],
  approvalsPending: ['approvals', 'pending'],
  agentActions: ['agent-actions'],
  notifications: ['notifications'],
  switchStatus: ['switch-status'],
  proposals: ['memory', 'proposals'],
  reminders: ['reminders'],
};

export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: () => api<Overview>('/api/overview'), refetchInterval: 15000 });
export const usePeople = (q?: string) => useQuery({ queryKey: [...keys.people, q], queryFn: () => api<Person[]>(`/api/people${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
export const usePerson = (id: string) => useQuery({ queryKey: keys.person(id), enabled: Boolean(id), queryFn: () => api<PersonProfile>(`/api/people/${id}`) });
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: () => api<Project[]>('/api/projects') });
export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), enabled: Boolean(id), queryFn: () => api<Project>(`/api/projects/${id}`) });
export const useTasks = (filter: { status?: string; overdue?: boolean; projectId?: string } = {}) => {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.overdue) params.set('overdue', 'true');
  if (filter.projectId) params.set('projectId', filter.projectId);
  return useQuery({ queryKey: keys.tasks(filter), queryFn: () => api<Task[]>(`/api/tasks?${params.toString()}`) });
};
export const useMemorySearch = (q: string) => useQuery({ queryKey: keys.memorySearch(q), enabled: q.trim().length >= 2, queryFn: () => api<{ entities: Entity[]; facts: Array<Record<string, unknown>>; relationships: unknown[]; answerHints: string[] }>(`/api/memory/search?q=${encodeURIComponent(q)}`) });
export const useEntity = (id: string | null) => useQuery({ queryKey: keys.entity(id ?? ''), enabled: Boolean(id), queryFn: () => api<Entity>(`/api/entities/${id}`) });
export const useApprovalsPending = () => useQuery({ queryKey: keys.approvalsPending, queryFn: () => api<Approval[]>('/api/approvals/pending'), refetchInterval: 10000 });
export const useApprovalsAll = () => useQuery({ queryKey: keys.approvals, queryFn: () => api<Approval[]>('/api/approvals') });
export const useAgentActions = (agent?: string) => useQuery({ queryKey: [...keys.agentActions, agent], queryFn: () => api<AgentAction[]>(`/api/agent-actions${agent ? `?agent=${agent}` : ''}`), refetchInterval: 10000 });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api<NotificationItem[]>('/api/notifications'), refetchInterval: 15000 });
export const useSwitchStatus = () => useQuery({ queryKey: keys.switchStatus, queryFn: () => api<SwitchStatus>('/api/switch/status'), refetchInterval: 20000 });
export const useMemoryProposals = (status = 'pending') => useQuery({ queryKey: [...keys.proposals, status], queryFn: () => api<Array<Record<string, unknown>>>(`/api/memory/proposals?status=${status}`) });

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
