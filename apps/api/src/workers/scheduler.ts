import { ScheduledJobModel, ReminderModel } from '../db/models/comms.js';
import { MessageModel } from '../db/models/switch.js';
import { OrganizationModel } from '../db/models/org.js';
import { config } from '../config.js';
import { deliverNotification } from '../services/notificationService.js';
import { nextOccurrence, type RepeatRule } from '../services/reminderService.js';
import { runMorningBrief, runOverdueScan, runDeadlineFollowup, runCommitmentCheck, runStaleTaskScan, recurringJobSpecs, repeatRuleFor } from '../services/proactive.js';
import { logAgentAction } from '../services/audit.js';

const INSTANCE_ID = `api-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let schedulerPaused = false;

export function isSchedulerPaused(): boolean {
  return schedulerPaused;
}

/** Pause/resume all proactive execution (the queue page toggles this). */
export function setSchedulerPaused(paused: boolean): void {
  schedulerPaused = paused;
  console.log(`[scheduler] ${paused ? 'paused' : 'resumed'} by operator`);
}

/** Cancel pending jobs (optionally only a kind). Reminder jobs also cancel their reminders. */
export async function cancelPendingJobs(orgId: string, kind?: string): Promise<number> {
  const filter: Record<string, unknown> = { orgId, status: 'pending' };
  if (kind) filter.kind = kind;
  const res = await ScheduledJobModel.updateMany(filter, { $set: { status: 'cancelled' } });
  if (!kind || kind === 'reminder') {
    await ReminderModel.updateMany(
      { orgId, status: { $in: ['scheduled', 'snoozed'] } },
      { $set: { status: 'cancelled' } },
    );
  }
  return res.modifiedCount ?? 0;
}

/** Clear messages stuck in "processing" (older than two minutes) so they stop haunting the UI. */
export async function clearStuckMessages(orgId: string): Promise<number> {
  const res = await MessageModel.updateMany(
    { orgId, 'processingResult.status': 'processing', updatedAt: { $lt: new Date(Date.now() - 120_000) } },
    { $set: { 'processingResult.status': 'error', 'processingResult.error': 'cleared from queue by operator', isProcessed: true } },
  );
  return res.modifiedCount ?? 0;
}

/** Atomically claim the next due job (lock 90s). Returns null when nothing is due. */
async function claimJob() {
  const now = new Date();
  return ScheduledJobModel.findOneAndUpdate(
    {
      status: 'pending',
      runAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }],
    },
    { $set: { status: 'running', lockedBy: INSTANCE_ID, lockedUntil: new Date(now.getTime() + 90_000) }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  );
}

async function finishJob(jobId: string, ok: boolean, error?: string) {
  await ScheduledJobModel.updateOne({ _id: jobId }, ok
    ? { $set: { status: 'done', lockedUntil: null }, $unset: { lockedBy: '' } }
    : { $set: { status: 'failed', lastError: error?.slice(0, 500), lockedUntil: null }, $unset: { lockedBy: '' } });
}

/** Re-enqueue a recurring job for its next occurrence. */
async function reschedule(orgId: string, job: { kind: string; repeatRule?: RepeatRule | null; payload?: unknown }) {
  if (!job.repeatRule) return;
  const next = nextOccurrence(new Date(), job.repeatRule);
  if (next.getTime() > Date.now() + 3650 * 86400000) return; // sentinel far-future
  await ScheduledJobModel.create({
    orgId,
    kind: job.kind,
    runAt: next,
    repeatRule: job.repeatRule,
    payload: job.payload as never,
    status: 'pending',
    idempotencyKey: `recurring:${job.kind}:${next.toISOString()}`,
  });
}

async function executeJob(job: { _id: string; orgId: string; kind: string; payload?: Record<string, unknown> | null; repeatRule?: RepeatRule | null }) {
  const { orgId, kind } = job;
  switch (kind) {
    case 'reminder': {
      const reminderId = job.payload?.reminderId as string | undefined;
      if (!reminderId) throw new Error('reminder job missing payload.reminderId');
      const reminder = await ReminderModel.findOne({ orgId, _id: reminderId });
      if (!reminder || reminder.status === 'cancelled') return;
      const targetType: 'room' | 'user' = reminder.roomId ? 'room' : reminder.userId ? 'user' : 'room';
      const targetId = reminder.roomId ?? reminder.userId ?? (config.SWITCH_DIGEST_ROOM_ID || 'teamforge-digest');
      const dueIso = reminder.dueAt?.toISOString?.() ?? new Date().toISOString();
      const res = await deliverNotification({
        orgId,
        targetType,
        targetId,
        title: reminder.title,
        body: reminder.body ?? reminder.title,
        kind: 'reminder',
        dedupeKey: `reminder:${reminder._id}:${dueIso}`,
        quietHoursOverride: reminder.quietHoursOverride,
        source: 'scheduler:reminder',
      });
      reminder.status = res.status === 'failed' ? 'failed' : 'sent';
      reminder.lastSentAt = new Date();
      reminder.sentCount += 1;
      await reminder.save();
      return;
    }
    case 'morning_brief': { await runMorningBrief(orgId); return; }
    case 'overdue_scan': { await runOverdueScan(orgId); return; }
    case 'deadline_followup': { await runDeadlineFollowup(orgId); return; }
    case 'commitment_check': { await runCommitmentCheck(orgId); return; }
    case 'stale_task_scan': { await runStaleTaskScan(orgId); return; }
    default:
      throw new Error(`Unknown job kind: ${kind}`);
  }
}

async function tick() {
  if (schedulerPaused) return;
  for (let i = 0; i < 5; i++) {
    const job = await claimJob();
    if (!job) return;
    try {
      await executeJob(job as never);
      await finishJob(job._id, true);
      if (job.repeatRule) {
        try {
          await reschedule(job.orgId, { kind: job.kind, repeatRule: job.repeatRule as RepeatRule, payload: job.payload });
        } catch (reErr) {
          console.error('[scheduler] reschedule error (non-fatal)', reErr);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts ?? 1;
      if (attempts >= (job.maxAttempts ?? 3)) {
        await finishJob(job._id, false, message);
        await logAgentAction(job.orgId, 'scheduler', 'job_failed', { detail: { kind: job.kind, jobId: job._id }, error: message });
      } else {
        // retry with backoff: requeue after attempts * 60s
        await ScheduledJobModel.updateOne({ _id: job._id }, { $set: { status: 'pending', lockedUntil: null, runAt: new Date(Date.now() + attempts * 60_000), lastError: message }, $unset: { lockedBy: '' } });
      }
    }
  }
}

/** Process all currently-due jobs once (used by tests; normally driven by startScheduler). */
export async function runDueJobsOnce() {
  await tick();
}

/** Seed the org's recurring proactive jobs (idempotent). Called by the seed script. */
export async function ensureRecurringJobs(orgId: string) {
  for (const spec of recurringJobSpecs()) {
    const rule = repeatRuleFor(spec.cron);
    const exists = await ScheduledJobModel.exists({ orgId, idempotencyKey: `recurring:${spec.kind}:seed` });
    if (exists) continue;
    const next = nextOccurrence(new Date(), rule);
    await ScheduledJobModel.create({
      orgId,
      kind: spec.kind,
      runAt: next,
      repeatRule: rule,
      status: 'pending',
      idempotencyKey: `recurring:${spec.kind}:seed`,
    });
  }
}

export function startScheduler(intervalMs = 5_000) {
  if (process.env.NODE_ENV === 'test') return () => undefined;
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // don't pile up ticks
    running = true;
    tick()
      .catch((err) => console.error('[scheduler] tick error', err))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref?.();
  // Also tick at boot shortly after start
  const boot = setTimeout(() => tick().catch(() => undefined), 1500);
  boot.unref?.();
  console.log(`[scheduler] persistent job runner started (instance ${INSTANCE_ID}, every ${intervalMs}ms, timezone ${config.ORG_TIMEZONE})`);
  return () => { clearInterval(timer); clearTimeout(boot); };
}
