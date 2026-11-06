import { ApprovalModel, type Approval } from '../db/models/comms.js';
import { TaskModel } from '../db/models/ops.js';
import { logAudit, recordEvent } from './audit.js';
import { assignTask } from './taskService.js';

export interface ApprovalRequestInput {
  orgId: string;
  requesterType: 'agent' | 'user' | 'system';
  requesterName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  reason?: string;
  impact?: string;
  approverUserId?: string;
  sourceId?: string;
}

export async function createApprovalRequest(input: ApprovalRequestInput): Promise<Approval> {
  const doc = await ApprovalModel.create({
    orgId: input.orgId,
    requesterType: input.requesterType,
    requesterName: input.requesterName,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.payload ?? {},
    reason: input.reason,
    impact: input.impact,
    approverUserId: input.approverUserId,
    sourceId: input.sourceId,
    status: 'pending',
  });
  await logAudit(input.orgId, { type: input.requesterType, name: input.requesterName }, 'approval.requested', { type: input.targetType, id: input.targetId }, { action: input.action });
  await recordEvent(input.orgId, 'approval.requested', { approvalId: doc._id, action: input.action, requesterName: input.requesterName });
  return doc.toObject() as Approval;
}

export async function getPendingApprovals(orgId: string, limit = 25) {
  return ApprovalModel.find({ orgId, status: 'pending' }).sort({ requestedAt: -1 }).limit(limit).lean();
}

export async function listApprovals(orgId: string, status?: string, limit = 50) {
  const q: Record<string, unknown> = { orgId };
  if (status) q.status = status;
  return ApprovalModel.find(q).sort({ requestedAt: -1 }).limit(limit).lean();
}

export async function approveApproval(orgId: string, approvalId: string, reviewer: { userId?: string; name: string }, note?: string) {
  const approval = await ApprovalModel.findOne({ orgId, _id: approvalId, status: 'pending' });
  if (!approval) return { ok: false, detail: 'Approval not found or already resolved' };

  // Apply the side effect BEFORE marking approved â€” if it fails, the approval stays pending.
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  try {
    switch (approval.action) {
      case 'assign':
      case 'reassign': {
        const { taskId, toUserId, fromUserId, reason } = payload as { taskId?: string; toUserId?: string; fromUserId?: string; reason?: string };
        if (!taskId || !toUserId) throw new Error('reassign payload requires taskId and toUserId');
        await assignTask(orgId, taskId, toUserId, { type: 'user', name: reviewer.name, id: reviewer.userId }, { method: 'approval', reason: reason ?? 'Approved reassignment' });
        await logAudit(orgId, { type: 'user', id: reviewer.userId, name: reviewer.name }, 'task.reassigned', { type: 'task', id: taskId }, { fromUserId, toUserId });
        break;
      }
      case 'deadline_change': {
        const { taskId, newDueDate } = payload as { taskId?: string; newDueDate?: string };
        if (!taskId || !newDueDate) throw new Error('deadline_change payload requires taskId and newDueDate');
        await TaskModel.updateOne({ orgId, _id: taskId }, { $set: { dueDate: new Date(newDueDate) } });
        await recordEvent(orgId, 'deadline.changed', { taskId, newDueDate });
        break;
      }
      case 'external_message':
      case 'memory_merge':
      case 'memory_update':
      default:
        // Generic approvals simply unblock the requester; domain code re-checks approval state.
        break;
    }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  approval.status = 'approved';
  approval.resolvedAt = new Date();
  approval.resolutionNote = note;
  await approval.save();
  await logAudit(orgId, { type: 'user', id: reviewer.userId, name: reviewer.name }, 'approval.approved', { type: approval.targetType ?? undefined, id: approval.targetId ?? undefined }, { action: approval.action, note });
  await recordEvent(orgId, 'approval.approved', { approvalId: approval._id, action: approval.action });
  return { ok: true, detail: 'Approved' };
}

export async function rejectApproval(orgId: string, approvalId: string, reviewer: { userId?: string; name: string }, note?: string) {
  const approval = await ApprovalModel.findOneAndUpdate(
    { orgId, _id: approvalId, status: 'pending' },
    { $set: { status: 'rejected', resolvedAt: new Date(), resolutionNote: note } },
    { new: true },
  );
  if (!approval) return { ok: false, detail: 'Approval not found or already resolved' };
  await logAudit(orgId, { type: 'user', id: reviewer.userId, name: reviewer.name }, 'approval.rejected', { type: approval.targetType ?? undefined, id: approval.targetId ?? undefined }, { action: approval.action, note });
  await recordEvent(orgId, 'approval.rejected', { approvalId: approval._id, action: approval.action });
  return { ok: true, detail: 'Rejected' };
}
