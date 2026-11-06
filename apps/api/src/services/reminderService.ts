import { createHash } from 'node:crypto';
import { ReminderModel, ScheduledJobModel, NotificationModel, type Reminder } from '../db/models/comms.js';
import { UserModel } from '../db/models/org.js';
import { logAudit } from './audit.js';

export interface RepeatRule {
  every: 'minute' | 'hour' | 'day' | 'week' | 'cron';
  interval?: number;
  cron?: string;
  until?: Date | null;
}

export function nextOccurrence(from: Date, rule: RepeatRule): Date {
  const d = new Date(from);
  switch (rule.every) {
    case 'minute': d.setMinutes(d.getMinutes() + (rule.interval ?? 1)); break;
    case 'hour': d.setHours(d.getHours() + (rule.interval ?? 1)); break;
    case 'day': d.setDate(d.getDate() + (rule.interval ?? 1)); break;
    case 'week': d.setDate(d.getDate() + 7 * (rule.interval ?? 1)); break;
    case 'cron': return nextCron(from, rule.cron ?? '0 9 * * *');
  }
  if (rule.until && d > rule.until) return new Date(8.64e15); // sentinel: far future = no more runs
  return d;
}

/** Minimal 5-field cron matcher (m h dom mon dow). Not a full cron engine — documented. */
export function nextCron(from: Date, cron: string): Date {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const match = (field: string, value: number) => {
    if (field === '*') return true;
    return field.split(',').some((part) => {
      if (part.includes('/')) {
        const [base, step] = part.split('/');
        const stepN = Number(step);
        if (base === '*') return value % stepN === 0;
        return value >= Number(base) && (value - Number(base)) % stepN === 0;
      }
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        return value >= a! && value <= b!;
      }
      return Number(part) === value;
    });
  };
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 370; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (match(min!, d.getMinutes()) && match(hour!, d.getHours()) && match(dom!, d.getDate()) && match(mon!, d.getMonth() + 1) && match(dow!, d.getDay())) {
      return new Date(d);
    }
  }
  return new Date(8.64e15);
}

export function reminderIdempotencyKey(orgId: string, parts: Record<string, unknown>): string {
  return createHash('sha256').update(orgId + JSON.stringify(parts)).digest('hex').slice(0, 40);
}

export async function createReminder(orgId: string, input: {
  title: string;
  body?: string;
  userId?: string | null;
  roomId?: string | null;
  dueAt: Date;
  repeatRule?: RepeatRule | null;
  createdBy: { type: 'user' | 'agent' | 'system'; name: string };
  idempotencyKey?: string | null;
  quietHoursOverride?: boolean;
  relatedTaskId?: string | null;
  relatedCommitmentId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ reminder: Reminder; deduplicated: boolean }> {
  if (input.idempotencyKey) {
    const existing = await ReminderModel.findOne({ orgId, idempotencyKey: input.idempotencyKey, status: { $in: ['scheduled', 'snoozed'] } }).lean();
    if (existing) return { reminder: existing as unknown as Reminder, deduplicated: true };
  }
  const reminder = await ReminderModel.create({
    orgId,
    title: input.title.trim(),
    body: input.body,
    userId: input.userId ?? undefined,
    roomId: input.roomId ?? undefined,
    dueAt: input.dueAt,
    repeatRule: input.repeatRule ?? null,
    status: 'scheduled',
    createdBy: input.createdBy,
    idempotencyKey: input.idempotencyKey ?? undefined,
    quietHoursOverride: input.quietHoursOverride ?? false,
    relatedTaskId: input.relatedTaskId ?? undefined,
    relatedCommitmentId: input.relatedCommitmentId ?? undefined,
    metadata: input.metadata ?? {},
  });
  await ScheduledJobModel.create({
    orgId,
    kind: 'reminder',
    runAt: input.dueAt,
    repeatRule: input.repeatRule ?? null,
    payload: { reminderId: reminder._id },
    status: 'pending',
    idempotencyKey: `reminder:${reminder._id}`,
  });
  await logAudit(orgId, input.createdBy, 'reminder.created', { type: 'reminder', id: reminder._id }, { title: input.title, dueAt: input.dueAt });
  return { reminder: reminder.toObject() as Reminder, deduplicated: false };
}

export async function updateReminder(orgId: string, reminderId: string, patch: { title?: string; body?: string; dueAt?: Date; status?: string; snoozedUntil?: Date | null }) {
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.snoozedUntil !== undefined) set.snoozedUntil = patch.snoozedUntil;
  if (patch.status === 'cancelled') {
    await ScheduledJobModel.updateMany({ orgId, kind: 'reminder', 'payload.reminderId': reminderId, status: 'pending' }, { $set: { status: 'cancelled' } });
    set.status = 'cancelled';
  }
  return ReminderModel.findOneAndUpdate({ orgId, _id: reminderId }, { $set: set }, { new: true }).lean();
}

export async function cancelReminder(orgId: string, reminderId: string, actorName: string) {
  const r = await updateReminder(orgId, reminderId, { status: 'cancelled' });
  if (r) await logAudit(orgId, { type: 'agent', name: actorName }, 'reminder.cancelled', { type: 'reminder', id: reminderId });
  return r;
}

export async function snoozeReminder(orgId: string, reminderId: string, until: Date, actorName: string) {
  const r = await ReminderModel.findOneAndUpdate(
    { orgId, _id: reminderId, status: { $in: ['scheduled', 'sent', 'snoozed'] } },
    { $set: { status: 'snoozed', snoozedUntil: until, dueAt: until } },
    { new: true },
  ).lean();
  if (r) {
    await ScheduledJobModel.create({ orgId, kind: 'reminder', runAt: until, payload: { reminderId, snooze: true }, status: 'pending', idempotencyKey: `reminder-snooze:${reminderId}:${until.getTime()}` });
    await logAudit(orgId, { type: 'agent', name: actorName }, 'reminder.snoozed', { type: 'reminder', id: reminderId }, { until });
  }
  return r;
}

export async function getUpcomingDeadlines(orgId: string, days = 7, limit = 25) {
  const { TaskModel } = await import('../db/models/ops.js');
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  const tasks = await TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $gte: now, $lte: until } }).sort({ dueDate: 1 }).limit(limit).lean();
  return tasks.map((t) => ({ id: t._id, title: t.title, dueDate: t.dueDate, status: t.status, priority: t.priority, projectId: t.projectId }));
}

export async function listReminders(orgId: string, opts: { userId?: string; status?: string; limit?: number } = {}) {
  const q: Record<string, unknown> = { orgId };
  if (opts.userId) q.userId = opts.userId;
  if (opts.status) q.status = opts.status;
  return ReminderModel.find(q).sort({ dueAt: 1 }).limit(Math.min(opts.limit ?? 50, 100)).lean();
}

/** Quiet-hours check for a user (or org defaults). Returns true if now is inside quiet hours. */
export function inQuietHours(orgQuietStart: string, orgQuietEnd: string, userStart?: string | null, userEnd?: string | null, now: Date = new Date()): boolean {
  const parse = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const start = parse(userStart ?? orgQuietStart);
  const end = parse(userEnd ?? orgQuietEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // overnight window
}

export async function countNotificationsToday(orgId: string, userId: string): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return NotificationModel.countDocuments({ orgId, targetType: 'user', targetId: userId, at: { $gte: start }, status: 'sent' });
}
