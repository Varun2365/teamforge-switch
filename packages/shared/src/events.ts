/** Typed internal events. Modules communicate through these, never by reaching into each other. */
export const EVENTS = {
  MessageReceived: 'message.received',
  MemoryProposed: 'memory.proposed',
  MemoryUpdated: 'memory.updated',
  EntityCreated: 'entity.created',
  EntityMerged: 'entity.merged',
  TaskProposed: 'task.proposed',
  TaskCreated: 'task.created',
  TaskAssigned: 'task.assigned',
  TaskCompleted: 'task.completed',
  TaskOverdue: 'task.overdue',
  CommitmentDetected: 'commitment.detected',
  CommitmentCompleted: 'commitment.completed',
  ProjectBlocked: 'project.blocked',
  ApprovalRequested: 'approval.requested',
  ApprovalApproved: 'approval.approved',
  ApprovalRejected: 'approval.rejected',
  DeadlineChanged: 'deadline.changed',
  RiskDetected: 'risk.detected',
  ReminderDue: 'reminder.due',
  AgentAction: 'agent.action',
} as const;

export type TeamForgeEvent = (typeof EVENTS)[keyof typeof EVENTS];

export interface EventEnvelope<T = unknown> {
  /** dedupe key — handlers must be idempotent */
  dedupeKey: string;
  type: TeamForgeEvent;
  orgId: string;
  at: string; // ISO
  payload: T;
}
