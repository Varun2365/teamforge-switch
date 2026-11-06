import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestOrg, testOrg } from './fixtures.js';
import { createReminder, nextOccurrence, nextCron } from '../src/services/reminderService.js';
import { runDueJobsOnce } from '../src/workers/scheduler.js';
import { NotificationModel, ReminderModel } from '../src/db/models/comms.js';

describe('reminders & scheduler', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestOrg();
  });
  afterAll(teardownTestDb);

  it('nextOccurrence advances by interval (day)', () => {
    const from = new Date('2026-11-06T10:00:00Z');
    const next = nextOccurrence(from, { every: 'day', interval: 2 });
    expect(next.toISOString()).toBe('2026-11-08T10:00:00.000Z');
  });

  it('nextCron computes the next 09:00 slot', () => {
    const from = new Date('2026-11-06T07:30:00');
    const next = nextCron(from, '0 9 * * *');
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('createReminder is idempotent by key (second call returns the same reminder)', async () => {
    const { orgId, rahulId } = testOrg();
    const dueAt = new Date(Date.now() + 3600_000);
    const first = await createReminder(orgId, { title: 'Idempotency probe', userId: rahulId, dueAt, createdBy: { type: 'agent', name: 'agent:test' }, idempotencyKey: 'idem-probe-1' });
    const second = await createReminder(orgId, { title: 'Idempotency probe', userId: rahulId, dueAt, createdBy: { type: 'agent', name: 'agent:test' }, idempotencyKey: 'idem-probe-1' });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.reminder._id).toBe(first.reminder._id);
  });

  it('a due reminder is claimed by the worker, delivered as notification, and marked sent', async () => {
    const { orgId, aaravId } = testOrg();
    const dueAt = new Date(Date.now() - 1000); // already due
    await createReminder(orgId, { title: 'Worker probe', body: 'Does the worker deliver me?', userId: aaravId, dueAt, createdBy: { type: 'agent', name: 'agent:test' }, idempotencyKey: 'worker-probe-1' });
    await runDueJobsOnce();
    const notifications = await NotificationModel.find({ orgId, targetId: aaravId, kind: 'reminder' }).lean();
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const reminder = await ReminderModel.findOne({ orgId, idempotencyKey: 'worker-probe-1' }).lean();
    expect(reminder?.status).toBe('sent');
  });

  it('re-running the worker does not double-deliver (dedupeKey)', async () => {
    const { orgId, aaravId } = testOrg();
    const dueAt = new Date(Date.now() - 1000);
    await createReminder(orgId, { title: 'Dedup delivery probe', userId: aaravId, dueAt, createdBy: { type: 'agent', name: 'agent:test' }, idempotencyKey: 'dedup-probe-1' });
    await runDueJobsOnce();
    await runDueJobsOnce();
    const notifications = await NotificationModel.find({ orgId, targetId: aaravId, kind: 'reminder' }).lean();
    const sent = notifications.filter((n) => n.status === 'sent' || n.status === 'suppressed');
    expect(sent.length).toBeLessThanOrEqual(2); // one per reminder, never doubled per run
  });
});
