/** API client for the TEAMFORGE backend. Key comes from Settings (localStorage) or the dev-injected .env key. */

declare const __DEV_API_KEY__: string | undefined;

const KEY_STORAGE = 'teamforge.apikey';

export function getApiKey(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_STORAGE) : null;
  if (stored) return stored;
  const dev = typeof __DEV_API_KEY__ !== 'undefined' ? __DEV_API_KEY__ : '';
  return dev || '';
}
export function setApiKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? safeParse(text) : null;
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code);
  }
  return json as T;
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/* ── Typed shapes (fields optional where the backend may omit them) ── */

export interface Overview {
  profile: { name: string; timezone?: string; maxProactivePerDay?: number } | null;
  activeProjects: number; totalPeople: number; openTasks: number; overdueTasks: number; blockedTasks: number; pendingApprovals: number;
  projects: Array<{ id: string; name: string; health: string; dueDate?: string | null; openTasks: number; overdueTasks: number }>;
  recentDecisions: Array<{ id: string; title: string; decidedAt: string; decidedBy?: string[] }>;
  upcomingDeadlines: Array<{ id: string; title: string; dueDate?: string | null; status: string; priority: string }>;
  agentActivity: Array<{ id: string; agent: string; action: string; outputSummary?: string; at: string; demo?: boolean; error?: string }>;
  notifications: Array<{ id: string; title?: string; body: string; kind: string; status: string; demo?: boolean; at: string }>;
}

export interface Person {
  id: string; name: string; email?: string; role: string; title?: string | null; department?: string | null; departmentId?: string | null; managerUserId?: string | null; activeAssignments: number; joinedAt?: string | null; location?: string | null;
}

export interface PersonProfile {
  id: string; name: string; email?: string; role: string; title?: string | null; location?: string | null; joinedAt?: string | null;
  department?: { id: string; name: string } | null;
  reportsTo?: { id: string; name: string } | null;
  skills: Array<{ name: string; level: number; confirmedBy: string }>;
  workload: { activeAssignments: number; inProgress: number; blocked: number; todo: number; overdue: number; capacityNote: string; tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate?: string | null }> };
}

export interface Project {
  id: string; key: string; name: string; description?: string; category: string; status: string; health: string; dueDate?: string | null; startDate?: string | null;
  owner?: { id: string; name: string } | null;
  milestones?: Array<{ _id: string; name: string; dueDate?: string | null; status: string }>;
  members?: Array<{ userId: string; role: string; name: string }>;
  stats?: { totalTasks: number; openTasks: number; doneTasks: number; overdueTasks: number; blockedTasks: number };
}

export interface Task {
  id: string; title: string; description?: string; status: string; priority: string; dueDate?: string | null; category?: string;
  projectId?: string | null; assignees?: Array<{ userId: string; name: string; method?: string }>;
}

export interface Entity {
  _id?: string; id: string; type: string; name: string; status: string; attributes?: Record<string, unknown>;
  facts?: Array<{ _id: string; predicate: string; valueText: string; status: string; validFrom?: string; validUntil?: string | null; recordedAt: string; confidence: number; sourceId?: string | null }>;
}

export interface Approval {
  _id: string; requesterName: string; action: string; targetType?: string; targetId?: string; reason?: string; impact?: string;
  status: string; requestedAt: string; payload?: Record<string, unknown>;
}

export interface AgentAction {
  _id: string; agent: string; action: string; outputSummary?: string; at: string; demo?: boolean; error?: string; durationMs?: number; roomId?: string;
}

export interface NotificationItem {
  _id: string; title?: string; body: string; kind: string; status: string; demo?: boolean; at: string;
}

export interface SwitchStatus {
  demoMode: boolean; serverUrl: string; server: string; proactiveBridgeConfigured: boolean;
  live?: boolean;
  runtime?: {
    running: boolean; roomId: string | null; roomName: string; onlineAgents: number;
    agents: Array<{ key: string; name: string; switchName: string; role: string; status: string; connected: boolean; switchAgentId?: string; rooms: string[]; lastError?: string }>;
    lastError: string | null;
  } | null;
  rooms: { lobby: string | null; digest: string | null };
}
