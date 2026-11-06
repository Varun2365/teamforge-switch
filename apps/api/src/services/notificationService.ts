import { NotificationModel } from '../db/models/comms.js';
import { OrganizationModel, UserModel } from '../db/models/org.js';
import { config } from '../config.js';
import { inQuietHours, countNotificationsToday } from './reminderService.js';
import { logAgentAction } from './audit.js';

export interface DeliverInput {
  orgId: string;
  targetType: 'user' | 'room';
  targetId: string; // userId or switchRoomId
  title?: string;
  body: string;
  kind?: string; // reminder | brief | overdue | approval | followup | general
  dedupeKey?: string;
  critical?: boolean; // bypasses quiet hours / frequency caps
  quietHoursOverride?: boolean;
  source?: string; // which worker/agent triggered this
}

export interface DeliverResult {
  status: 'sent' | 'suppressed' | 'failed' | 'deduplicated' | 'queued_dashboard';
  reason?: string;
  notificationId?: string;
}

/**
 * Deliver a proactive message. Live mode posts through Switch (the documented
 * `POST /agents/{agent_id}/message` endpoint, which needs no connection).
 * Demo mode records the notification locally and marks it demo — never faked as live.
 */
export async function deliverNotification(input: DeliverInput): Promise<DeliverResult> {
  const { orgId } = input;

  // 1) Idempotency — never double-send
  if (input.dedupeKey) {
    const existing = await NotificationModel.findOne({ orgId, dedupeKey: input.dedupeKey }).lean();
    if (existing && existing.status === 'sent') return { status: 'deduplicated', notificationId: existing._id };
    if (existing && existing.status === 'pending') {
      // Fall through and attempt delivery again
    } else if (existing) {
      return { status: existing.status === 'suppressed' ? 'suppressed' : 'failed', notificationId: existing._id };
    }
  }

  const org = await OrganizationModel.findById(orgId).lean();
  const orgQuietStart = org?.settings?.quietHoursStart ?? config.QUIET_HOURS_START;
  const orgQuietEnd = org?.settings?.quietHoursEnd ?? config.QUIET_HOURS_END;
  const demoMode = config.TEAMFORGE_DEMO_MODE;

  // 2) User-targeted guards: quiet hours + max notifications/day
  if (input.targetType === 'user') {
    const user = await UserModel.findOne({ orgId, _id: input.targetId }).lean();
    const quiet = inQuietHours(orgQuietStart, orgQuietEnd, user?.quietHoursStart, user?.quietHoursEnd);
    if (quiet && !input.critical && !input.quietHoursOverride) {
      const n = await NotificationModel.create({ orgId, targetType: 'user', targetId: input.targetId, channel: 'dashboard', title: input.title, body: input.body, kind: input.kind ?? 'general', status: 'suppressed', dedupeKey: input.dedupeKey, demo: demoMode, error: 'quiet hours' });
      return { status: 'suppressed', reason: 'quiet hours', notificationId: n._id };
    }
    const maxPerDay = user?.maxProactivePerDay ?? org?.settings?.maxProactivePerDay ?? config.PROACTIVE_MAX_PER_DAY;
    const sentToday = await countNotificationsToday(orgId, input.targetId);
    if (sentToday >= maxPerDay && !input.critical) {
      const n = await NotificationModel.create({ orgId, targetType: 'user', targetId: input.targetId, channel: 'dashboard', title: input.title, body: input.body, kind: input.kind ?? 'general', status: 'suppressed', dedupeKey: input.dedupeKey, demo: demoMode, error: 'daily cap reached' });
      return { status: 'suppressed', reason: `daily cap reached (${maxPerDay}/day)`, notificationId: n._id };
    }
  }

  // 3) Deliver: live Switch runtime (preferred) → legacy bridge → labelled dashboard record.
  const channel = demoMode ? 'dashboard' : 'switch';
  const record = await NotificationModel.create({ orgId, targetType: input.targetType, targetId: input.targetId, channel, title: input.title, body: input.body, kind: input.kind ?? 'general', dedupeKey: input.dedupeKey, demo: demoMode, status: 'pending', deliveredVia: demoMode ? 'api' : 'switch' });

  if (demoMode) {
    await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date() } });
    await logAgentAction(orgId, input.source ?? 'scheduler', 'proactive_post', { detail: { kind: input.kind, target: input.targetId }, outputSummary: input.body.slice(0, 200), demo: true });
    return { status: 'queued_dashboard', reason: 'demo mode — recorded on dashboard, not posted to Switch', notificationId: record._id };
  }

  if (input.targetType === 'room') {
    const { getSwitchRuntime } = await import('../integrations/switch/runtime.js');
    const runtime = getSwitchRuntime();
    if (runtime?.getStatus().running && runtime.getStatus().onlineAgents > 0) {
      const targetRoom = input.targetId && !input.targetId.startsWith('teamforge-') ? input.targetId : undefined;
      const res = await runtime.deliverProactive({ title: input.title ?? input.kind ?? 'Update', body: input.body, roomId: targetRoom });
      if (res.ok) {
        await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date(), deliveredVia: 'switch' } });
        await logAgentAction(orgId, input.source ?? 'scheduler', 'proactive_post', { roomId: targetRoom, detail: { kind: input.kind }, outputSummary: input.body.slice(0, 200) });
        return { status: 'sent', notificationId: record._id };
      }
      await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'failed', error: res.error } });
      return { status: 'failed', reason: res.error, notificationId: record._id };
    }
    // runtime offline → honest dashboard record
    await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date(), deliveredVia: 'dashboard', demo: true } });
    await logAgentAction(orgId, input.source ?? 'scheduler', 'proactive_post', { detail: { kind: input.kind, target: input.targetId }, outputSummary: input.body.slice(0, 200), demo: true });
    return { status: 'queued_dashboard', reason: 'Switch runtime offline — recorded on the dashboard instead (not pretending it posted)', notificationId: record._id };
  }

  // user-target notifications: @mention the person in the live room when possible
  if (input.targetType === 'user') {
    const { getSwitchRuntime } = await import('../integrations/switch/runtime.js');
    const { UserModel } = await import('../db/models/org.js');
    const runtime = getSwitchRuntime();
    if (runtime?.getStatus().running && runtime.getStatus().onlineAgents > 0) {
      const user = await UserModel.findOne({ orgId, _id: input.targetId }).lean();
      const res = await runtime.deliverProactive({ title: input.title ?? input.kind ?? 'Reminder', body: input.body, mentionUserIds: user ? [String(user._id)] : undefined });
      if (res.ok) {
        await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date(), deliveredVia: 'switch' } });
        await logAgentAction(orgId, input.source ?? 'scheduler', 'proactive_post', { detail: { kind: input.kind, target: input.targetId }, outputSummary: input.body.slice(0, 200) });
        return { status: 'sent', notificationId: record._id };
      }
      await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'failed', error: res.error } });
      return { status: 'failed', reason: res.error, notificationId: record._id };
    }
    await NotificationModel.updateOne({ _id: record._id }, { $set: { status: 'sent', sentAt: new Date(), deliveredVia: 'dashboard', demo: true } });
    await logAgentAction(orgId, input.source ?? 'scheduler', 'proactive_post', { detail: { kind: input.kind, target: input.targetId }, outputSummary: input.body.slice(0, 200), demo: true });
    return { status: 'sent', notificationId: record._id };
  }

  return { status: 'failed', reason: 'unsupported target', notificationId: record._id };
}
