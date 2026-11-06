import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { createApprovalRequest, getPendingApprovals } from '../services/approvalService.js';
import { createReminder } from '../services/reminderService.js';
import { deliverNotification } from '../services/notificationService.js';
import { logAgentAction } from '../services/audit.js';
import { recordSource } from '../services/sourceService.js';

export function registerCoordinationTools(reg: ToolRegistry) {
  reg.register({
    name: 'request_status_update',
    description: 'Ask a person or room for a status update on a task/project. Delivers a polite, specific nudge.',
    tier: 'write',
    input: z.object({
      targetType: z.enum(['user', 'room']).default('user'),
      targetId: z.string().describe('userId or switchRoomId'),
      about: z.string().min(3).describe('What you want an update on'),
      roomId: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const body = `Quick one — ${actor.name} here. Could you give us a 30-second status on: ${input.about}? No detail needed beyond where it stands and anything blocking you.`;
      const res = await deliverNotification({
        orgId,
        targetType: input.targetType,
        targetId: input.targetId,
        title: 'Status check',
        body,
        kind: 'followup',
        dedupeKey: `status:${input.targetId}:${Buffer.from(input.about).toString('base64').slice(0, 24)}`,
        quietHoursOverride: false,
        source: actor.name,
      });
      return { delivered: res.status !== 'failed', ...res };
    },
  });

  reg.register({
    name: 'create_follow_up',
    description: 'Create a follow-up nudge for later (reminder-style). Use for "circle back on X on Thursday".',
    tier: 'write',
    input: z.object({
      userId: z.string().optional().nullable(),
      roomId: z.string().optional().nullable(),
      about: z.string().min(3),
      when: z.string().datetime().optional().describe('When to nudge. Omit for tomorrow 09:30 local.'),
    }),
    handler: async ({ orgId, actor }, input) => {
      const when = input.when ? new Date(input.when) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); return d; })();
      const { reminder } = await createReminder(orgId, {
        title: `Follow-up: ${input.about}`,
        body: `Following up on: ${input.about}`,
        userId: input.userId ?? null,
        roomId: input.roomId ?? null,
        dueAt: when,
        createdBy: actor,
        idempotencyKey: `followup:${actor.name}:${Buffer.from(input.about).toString('base64').slice(0, 24)}:${when.toDateString()}`,
      });
      return { reminderId: reminder._id, dueAt: reminder.dueAt };
    },
  });

  reg.register({
    name: 'propose_reassignment',
    description: 'Propose moving a task to someone else. Creates an approval request — assignment does NOT happen until a human approves.',
    tier: 'sensitive',
    input: z.object({
      taskId: z.string(),
      fromUserId: z.string().optional(),
      toUserId: z.string(),
      reason: z.string().min(3),
      impact: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const approval = await createApprovalRequest({
        orgId,
        requesterType: actor.type,
        requesterName: actor.name,
        action: 'reassign',
        targetType: 'task',
        targetId: input.taskId,
        payload: { taskId: input.taskId, fromUserId: input.fromUserId, toUserId: input.toUserId, reason: input.reason },
        reason: input.reason,
        impact: input.impact ?? 'Task ownership changes after human approval; both parties should be told in the room.',
      });
      return { status: 'approval_required', approvalId: approval._id };
    },
  });

  reg.register({
    name: 'propose_deadline_change',
    description: 'Propose moving a deadline. Creates an approval request — the date does NOT change until a human approves.',
    tier: 'sensitive',
    input: z.object({
      taskId: z.string(),
      newDueDate: z.string().datetime(),
      reason: z.string().min(3),
      impact: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const approval = await createApprovalRequest({
        orgId,
        requesterType: actor.type,
        requesterName: actor.name,
        action: 'deadline_change',
        targetType: 'task',
        targetId: input.taskId,
        payload: { taskId: input.taskId, newDueDate: input.newDueDate, reason: input.reason },
        reason: input.reason,
        impact: input.impact ?? 'Deadline changes only after human approval. Downstream dependencies should be checked by quality-risk.',
      });
      return { status: 'approval_required', approvalId: approval._id };
    },
  });

  reg.register({
    name: 'create_approval_request',
    description: 'Generic approval request for anything consequential (external messages, big decisions, access). Use the specific propose_* tools when they fit.',
    tier: 'write',
    input: z.object({
      action: z.string().min(2).describe('e.g. external_message, memory_merge, access_grant'),
      targetType: z.string().optional(),
      targetId: z.string().optional(),
      payload: z.record(z.unknown()).default({}),
      reason: z.string().min(3),
      impact: z.string().optional(),
      approverUserId: z.string().optional(),
    }),
    handler: ({ orgId, actor }, input) =>
      createApprovalRequest({
        orgId,
        requesterType: actor.type,
        requesterName: actor.name,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: input.payload,
        reason: input.reason,
        impact: input.impact,
        approverUserId: input.approverUserId,
      }).then((a) => ({ approvalId: a._id, status: a.status })),
  });

  reg.register({
    name: 'get_pending_approvals',
    description: 'List approvals waiting on a human.',
    tier: 'read',
    input: z.object({ limit: z.number().int().min(1).max(50).default(25) }),
    handler: ({ orgId }, { limit }) => getPendingApprovals(orgId, limit),
  });

  reg.register({
    name: 'record_handoff',
    description: 'Record a handoff between agents or to a human (audit trail for agent collaboration).',
    tier: 'write',
    input: z.object({
      fromAgent: z.string(),
      toAgent: z.string(),
      summary: z.string().min(3),
      roomId: z.string().optional(),
    }),
    handler: async ({ orgId }, input) => {
      await logAgentAction(orgId, input.fromAgent, 'handoff', {
        roomId: input.roomId,
        detail: { toAgent: input.toAgent, summary: input.summary },
        outputSummary: `→ ${input.toAgent}: ${input.summary}`,
      });
      const src = await recordSource({ orgId, type: 'system', ref: `handoff:${Date.now()}`, excerpt: `${input.fromAgent} → ${input.toAgent}: ${input.summary}` });
      return { recorded: true, sourceId: src._id };
    },
  });
}
