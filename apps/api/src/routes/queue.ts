import type { FastifyInstance } from 'fastify';
import { ScheduledJobModel, ReminderModel, NotificationModel } from '../db/models/comms.js';
import { MessageModel } from '../db/models/switch.js';
import { isSchedulerPaused, setSchedulerPaused, cancelPendingJobs, clearStuckMessages } from '../workers/scheduler.js';
import { getSwitchRuntime } from '../integrations/switch/runtime.js';

export async function queueRoutes(app: FastifyInstance) {
  app.get('/api/queue', async (req) => {
    const { orgId } = req.auth;
    const runtime = getSwitchRuntime();
    const oneHourAgo = new Date(Date.now() - 3600_000);
    const [pendingJobs, reminders, stuck, totalHour, repliedHour, processing, errorsHour, notifications] = await Promise.all([
      ScheduledJobModel.find({ orgId, status: { $in: ['pending', 'running'] } }).sort({ runAt: 1 }).limit(100).lean(),
      ReminderModel.find({ orgId, status: { $in: ['scheduled', 'snoozed'] } }).sort({ dueAt: 1 }).limit(50).lean(),
      MessageModel.find({ orgId, 'processingResult.status': 'processing' }).sort({ createdAt: -1 }).limit(20).lean(),
      MessageModel.countDocuments({ orgId, createdAt: { $gte: oneHourAgo } }),
      MessageModel.countDocuments({ orgId, createdAt: { $gte: oneHourAgo }, 'processingResult.status': 'replied' }),
      MessageModel.countDocuments({ orgId, 'processingResult.status': 'processing' }),
      MessageModel.countDocuments({ orgId, createdAt: { $gte: oneHourAgo }, 'processingResult.status': 'error' }),
      NotificationModel.find({ orgId }).sort({ at: -1 }).limit(10).lean(),
    ]);
    return {
      schedulerPaused: isSchedulerPaused(),
      runtime: runtime?.getQueueStats() ?? null,
      stats: { messagesLastHour: totalHour, repliedLastHour: repliedHour, processing, errorsLastHour: errorsHour },
      pendingJobs: pendingJobs.map((j) => ({ id: j._id, kind: j.kind, runAt: j.runAt, status: j.status, attempts: j.attempts, lastError: j.lastError ?? null, repeatRule: j.repeatRule ?? null })),
      reminders: reminders.map((r) => ({ id: r._id, title: r.title, dueAt: r.dueAt, status: r.status, userId: r.userId ?? null, roomId: r.roomId ?? null, repeatRule: r.repeatRule ?? null })),
      stuck: stuck.map((m) => ({ id: m._id, sender: m.senderName, body: m.body?.slice(0, 240), createdAt: m.createdAt, status: m.processingResult?.status })),
      notifications: notifications.map((n) => ({ id: n._id, title: n.title, body: n.body, kind: n.kind, status: n.status, deliveredVia: n.deliveredVia, at: n.at })),
    };
  });

  app.post('/api/queue/pause', async (req) => {
    const { paused } = (req.body ?? {}) as { paused?: boolean };
    setSchedulerPaused(Boolean(paused));
    return { paused: isSchedulerPaused() };
  });

  app.post('/api/queue/cancel-jobs', async (req) => {
    const { kind } = (req.body ?? {}) as { kind?: string };
    const cancelled = await cancelPendingJobs(req.auth.orgId, kind);
    return { cancelled, kind: kind ?? 'all' };
  });

  app.post('/api/queue/clean-stuck', async (req) => {
    const cleaned = await clearStuckMessages(req.auth.orgId);
    return { cleaned };
  });

  app.delete('/api/queue/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await ScheduledJobModel.updateOne({ orgId: req.auth.orgId, _id: id, status: 'pending' }, { $set: { status: 'cancelled' } });
    if (!res.modifiedCount) return reply.code(404).send({ error: { code: 'not_found', message: 'Job not found or already running' } });
    return { cancelled: true };
  });

  app.delete('/api/queue/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await ReminderModel.updateOne({ orgId: req.auth.orgId, _id: id }, { $set: { status: 'cancelled' } });
    if (!res.modifiedCount) return reply.code(404).send({ error: { code: 'not_found', message: 'Reminder not found' } });
    await ScheduledJobModel.updateMany({ orgId: req.auth.orgId, kind: 'reminder', 'payload.reminderId': id, status: 'pending' }, { $set: { status: 'cancelled' } });
    return { cancelled: true };
  });
}
