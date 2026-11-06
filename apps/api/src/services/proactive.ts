import { ProjectModel, TaskModel, TaskDependencyModel, TaskAssignmentModel, CommitmentModel } from '../db/models/ops.js';
import { OrganizationModel, UserModel } from '../db/models/org.js';
import { config } from '../config.js';
import { deliverNotification } from './notificationService.js';
import { nextOccurrence, type RepeatRule } from './reminderService.js';
import { getAffectedDependencies } from './riskService.js';
import { recordEvent, logAgentAction } from './audit.js';
import { deRoboticize } from '@teamforge/shared';

const fmtDay = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'no date');
const firstName = (n: string) => n.split(' ')[0] ?? n;

/* ───────── Morning brief ───────── */

export async function composeMorningBrief(orgId: string): Promise<string> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3600_000);
  const [org, dueSoon, overdue, blocked, approvals, projects] = await Promise.all([
    OrganizationModel.findById(orgId).lean(),
    TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $gte: now, $lte: in48h } }).sort({ dueDate: 1 }).limit(6).lean(),
    TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $lt: now } }).sort({ dueDate: 1 }).limit(6).lean(),
    TaskModel.countDocuments({ orgId, status: 'blocked' }),
    import('../db/models/comms.js').then((m) => m.ApprovalModel.countDocuments({ orgId, status: 'pending' })),
    ProjectModel.find({ orgId, status: 'active' }).lean(),
  ]);
  const assignments = await TaskAssignmentModel.find({ orgId, active: true, taskId: { $in: [...dueSoon, ...overdue].map((t) => t._id) } }).lean();
  const users = await UserModel.find({ orgId }).lean();
  const nameById = new Map(users.map((u) => [u._id, u.name]));
  const assigneeOf = (taskId: string) => assignments.filter((a) => a.taskId === taskId).map((a) => firstName(nameById.get(a.userId ?? '') ?? 'unassigned')).join(', ') || 'unassigned';
  const atRisk = projects.filter((p) => p.health !== 'on_track');

  const lines: string[] = [];
  lines.push(`Morning — here's where ${org?.name ?? 'the team'} stands.`);
  if (dueSoon.length) {
    lines.push('');
    lines.push(dueSoon.length === 1 ? 'Due in the next two days:' : 'Due in the next two days:');
    for (const t of dueSoon) lines.push(`• ${t.title} — ${assigneeOf(t._id)} · ${fmtDay(t.dueDate)}`);
  }
  if (overdue.length) {
    lines.push('');
    lines.push('Overdue (needs eyes):');
    for (const t of overdue) lines.push(`• ${t.title} — ${assigneeOf(t._id)} · was due ${fmtDay(t.dueDate)}`);
  }
  if (blocked) { lines.push(''); lines.push(`${blocked} task(s) sitting blocked.`); }
  if (atRisk.length) lines.push(`At risk: ${atRisk.map((p) => p.name).join(', ')}.`);
  lines.push('');
  lines.push(approvals > 0 ? `${approvals} approval(s) waiting on a human in the dashboard.` : 'No approvals waiting.');
  if (!dueSoon.length && !overdue.length && !blocked && atRisk.length === 0) lines.push('', 'Nothing on fire today. Steady as she goes.');
  lines.push('', '— TeamForge');
  return deRoboticize(lines.join('\n'));
}

export async function runMorningBrief(orgId: string) {
  const body = await composeMorningBrief(orgId);
  const targetRoom = config.SWITCH_DIGEST_ROOM_ID || 'teamforge-digest';
  const res = await deliverNotification({
    orgId,
    targetType: 'room',
    targetId: targetRoom,
    title: 'Morning brief',
    body,
    kind: 'brief',
    dedupeKey: `brief:${new Date().toDateString()}`,
    source: 'scheduler:morning_brief',
  });
  return res;
}

/* ───────── Overdue scan (with dependency blast radius) ───────── */

export async function runOverdueScan(orgId: string) {
  const now = new Date();
  const tasks = await TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $lt: now } }).lean();
  const day = new Date().toISOString().slice(0, 10);
  let nudged = 0;
  let escalated = 0;

  for (const task of tasks) {
    const days = Math.floor((now.getTime() - new Date(task.dueDate!).getTime()) / 86400000);
    const [assignments, affected] = await Promise.all([
      TaskAssignmentModel.find({ orgId, taskId: task._id, active: true }).lean(),
      getAffectedDependencies(orgId, task._id),
    ]);
    const blockingOthers = affected.filter((a) => a.status !== 'done' && a.status !== 'cancelled');
    const users = await UserModel.find({ orgId, _id: { $in: assignments.map((a) => a.userId) } }).lean();

    for (const a of assignments) {
      const res = await deliverNotification({
        orgId,
        targetType: 'user',
        targetId: a.userId!,
        title: 'This one slipped',
        body: `Hey ${firstName(users.find((u) => u._id === a.userId)?.name ?? 'there')} — "${task.title}" was due ${fmtDay(task.dueDate)} and is still open.${blockingOthers.length ? ` ${blockingOthers.length} task(s) are waiting on it, so it matters beyond just yours.` : ''} Give me a quick ETA when you can?`,
        kind: 'overdue',
        dedupeKey: `overdue:${task._id}:${day}`,
        critical: days >= 3,
        source: 'scheduler:overdue_scan',
      });
      if (res.status === 'sent' || res.status === 'queued_dashboard') nudged++;
    }

    // Manager escalation: 2+ days overdue AND someone else's work is blocked by it
    if (days >= 2 && blockingOthers.length > 0) {
      const owners = await UserModel.find({ orgId, role: { $in: ['owner', 'administrator', 'manager'] } }).lean();
      for (const owner of owners) {
        const res = await deliverNotification({
          orgId,
          targetType: 'user',
          targetId: owner._id,
          title: 'Dependency risk',
          body: `"${task.title}" is ${days} day(s) overdue and ${blockingOthers.length} downstream task(s) are blocked on it (${blockingOthers.slice(0, 3).map((t) => t.title).join(', ')}). Worth a nudge or a re-plan.`,
          kind: 'escalation',
          dedupeKey: `escalation:${task._id}:${day}`,
          critical: true,
          source: 'scheduler:overdue_scan',
        });
        if (res.status !== 'suppressed' && res.status !== 'failed') escalated++;
      }
      await recordEvent(orgId, 'risk.detected', { taskId: task._id, daysOverdue: days, affected: blockingOthers.map((t) => t.taskId) });
    }
  }
  await logAgentAction(orgId, 'scheduler:overdue_scan', 'scan_complete', { detail: { overdue: tasks.length, nudged, escalated } });
  return { overdue: tasks.length, nudged, escalated };
}

/* ───────── Deadline follow-ups (T-26h) ───────── */

export async function runDeadlineFollowup(orgId: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 26 * 3600_000);
  const tasks = await TaskModel.find({ orgId, status: { $nin: ['done', 'cancelled'] }, dueDate: { $gte: now, $lte: soon } }).lean();
  const day = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const task of tasks) {
    const assignments = await TaskAssignmentModel.find({ orgId, taskId: task._id, active: true }).lean();
    const users = await UserModel.find({ orgId, _id: { $in: assignments.map((a) => a.userId) } }).lean();
    for (const a of assignments) {
      const res = await deliverNotification({
        orgId,
        targetType: 'user',
        targetId: a.userId!,
        title: 'Due date approaching',
        body: `"${task.title}" is due ${fmtDay(task.dueDate)}. Flag it now if that's not going to happen — much easier to re-plan today than to apologize tomorrow.`,
        kind: 'deadline',
        dedupeKey: `t24:${task._id}:${day}`,
        source: 'scheduler:deadline_followup',
      });
      if (res.status !== 'suppressed' && res.status !== 'failed' && res.status !== 'deduplicated') sent++;
    }
  }
  return { dueSoon: tasks.length, sent };
}

/* ───────── Commitment checks ───────── */

export async function runCommitmentCheck(orgId: string) {
  const now = new Date();
  const due = await CommitmentModel.find({ orgId, status: 'open', dueDate: { $lte: new Date(now.getTime() + 2 * 3600_000) } }).lean();
  const day = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const c of due) {
    const user = c.ownerUserId ? await UserModel.findOne({ orgId, _id: c.ownerUserId }).lean() : null;
    const overdue = c.dueDate && new Date(c.dueDate) < now;
    const res = await deliverNotification({
      orgId,
      targetType: 'user',
      targetId: c.ownerUserId!,
      title: overdue ? 'You said this was happening' : 'Commitment due soon',
      body: `${firstName(user?.name ?? 'Hey')} — you mentioned: "${c.description}"${c.dueDate ? ` (due ${fmtDay(c.dueDate)})` : ''}. ${overdue ? 'It slipped past the date — is it done, or should we reset it?' : 'Still on track?'}`,
      kind: 'commitment',
      dedupeKey: `commitment:${c._id}:${day}`,
      source: 'scheduler:commitment_check',
    });
    if (res.status !== 'suppressed' && res.status !== 'failed' && res.status !== 'deduplicated') sent++;
  }
  return { checked: due.length, sent };
}

/* ───────── Stale in-progress tasks ───────── */

export async function runStaleTaskScan(orgId: string) {
  const cutoff = new Date(Date.now() - 5 * 86400000);
  const tasks = await TaskModel.find({ orgId, status: 'in_progress', updatedAt: { $lt: cutoff } }).lean();
  const day = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const task of tasks) {
    const assignments = await TaskAssignmentModel.find({ orgId, taskId: task._id, active: true }).lean();
    const users = await UserModel.find({ orgId, _id: { $in: assignments.map((a) => a.userId) } }).lean();
    for (const a of assignments) {
      const res = await deliverNotification({
        orgId,
        targetType: 'user',
        targetId: a.userId!,
        title: 'Quiet on this one',
        body: `"${task.title}" has been in progress for 5+ days without an update. Is it moving, stuck, or done-but-unmarked?`,
        kind: 'stale',
        dedupeKey: `stale:${task._id}:${day}`,
        source: 'scheduler:stale_scan',
      });
      if (res.status !== 'suppressed' && res.status !== 'failed' && res.status !== 'deduplicated') sent++;
    }
  }
  return { stale: tasks.length, sent };
}

/** Ensure the org has its recurring proactive jobs. Idempotent by idempotencyKey. */
export function recurringJobSpecs(): Array<{ kind: string; cron: string; hour: number; minute: number }> {
  return [
    { kind: 'morning_brief', cron: config.MORNING_BRIEF_CRON, hour: 8, minute: 30 },
    { kind: 'overdue_scan', cron: '0 9 * * *', hour: 9, minute: 0 },
    { kind: 'deadline_followup', cron: '0 */6 * * *', hour: 0, minute: 0 },
    { kind: 'commitment_check', cron: '0 10 * * *', hour: 10, minute: 0 },
    { kind: 'stale_task_scan', cron: '30 10 * * *', hour: 10, minute: 30 },
  ];
}

export const repeatRuleFor = (cron: string): RepeatRule => ({ every: 'cron', interval: 1, cron });
export const nextRun = (cron: string): Date => nextOccurrence(new Date(), repeatRuleFor(cron));
