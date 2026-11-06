import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { createReminder, updateReminder, cancelReminder, getUpcomingDeadlines, listReminders } from '../services/reminderService.js';

export function registerSchedulingTools(reg: ToolRegistry) {
  reg.register({
    name: 'create_reminder',
    description: 'Create a reminder. One-time by default; pass repeatRule for recurring. Idempotent when idempotencyKey is set (safe to call twice).',
    tier: 'write',
    input: z.object({
      title: z.string().min(2),
      body: z.string().optional(),
      userId: z.string().optional().nullable(),
      roomId: z.string().optional().nullable(),
      dueAt: z.string().datetime(),
      repeatRule: z.object({
        every: z.enum(['minute', 'hour', 'day', 'week', 'cron']),
        interval: z.number().int().min(1).default(1),
        cron: z.string().optional(),
        until: z.string().datetime().optional().nullable(),
      }).optional().nullable(),
      idempotencyKey: z.string().optional().nullable(),
      quietHoursOverride: z.boolean().default(false),
      relatedTaskId: z.string().optional().nullable(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const repeat = input.repeatRule ? { ...input.repeatRule, until: input.repeatRule.until ? new Date(input.repeatRule.until) : null } : null;
      const { reminder, deduplicated } = await createReminder(orgId, {
        ...input,
        dueAt: new Date(input.dueAt),
        repeatRule: repeat,
        createdBy: actor,
        idempotencyKey: input.idempotencyKey ?? undefined,
      });
      return { reminderId: reminder._id, dueAt: reminder.dueAt, repeatRule: reminder.repeatRule, deduplicated };
    },
  });

  reg.register({
    name: 'update_reminder',
    description: 'Update a reminder: title, body, dueAt, or snooze it (status/snoozedUntil).',
    tier: 'write',
    input: z.object({
      reminderId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      dueAt: z.string().datetime().optional(),
      snoozeUntil: z.string().datetime().optional(),
    }),
    handler: async ({ orgId }, { reminderId, ...patch }) => {
      const updated = await updateReminder(orgId, reminderId, {
        ...patch,
        dueAt: patch.dueAt ? new Date(patch.dueAt) : undefined,
        snoozedUntil: patch.snoozeUntil ? new Date(patch.snoozeUntil) : undefined,
        status: patch.snoozeUntil ? 'snoozed' : undefined,
      });
      if (!updated) throw new Error('Reminder not found');
      return { reminderId, status: updated.status, dueAt: updated.dueAt };
    },
  });

  reg.register({
    name: 'cancel_reminder',
    description: 'Cancel a reminder and its scheduled job.',
    tier: 'write',
    input: z.object({ reminderId: z.string() }),
    handler: async ({ orgId, actor }, { reminderId }) => {
      const r = await cancelReminder(orgId, reminderId, actor.name);
      if (!r) throw new Error('Reminder not found');
      return { reminderId, status: r.status };
    },
  });

  reg.register({
    name: 'get_upcoming_deadlines',
    description: 'Dated open tasks in the next N days (default 7), soonest first.',
    tier: 'read',
    input: z.object({ days: z.number().int().min(1).max(60).default(7), limit: z.number().int().min(1).max(50).default(25) }),
    handler: ({ orgId }, { days, limit }) => getUpcomingDeadlines(orgId, days, limit),
  });

  reg.register({
    name: 'schedule_recurring_followup',
    description: 'Schedule a recurring follow-up check-in (e.g. "every Monday 10:00 check on the migration").',
    tier: 'write',
    input: z.object({
      title: z.string().min(2),
      body: z.string().optional(),
      userId: z.string().optional().nullable(),
      roomId: z.string().optional().nullable(),
      cron: z.string().optional().describe('5-field cron, e.g. "0 10 * * 1" for Mondays 10:00'),
      every: z.enum(['minute', 'hour', 'day', 'week', 'cron']).default('week'),
      interval: z.number().int().min(1).default(1),
      firstDueAt: z.string().datetime().describe('When the first occurrence happens'),
      relatedTaskId: z.string().optional().nullable(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const repeatRule = input.cron
        ? { every: 'cron' as const, interval: 1, cron: input.cron, until: null }
        : { every: input.every, interval: input.interval, until: null };
      const { reminder } = await createReminder(orgId, {
        title: input.title,
        body: input.body,
        userId: input.userId ?? null,
        roomId: input.roomId ?? null,
        dueAt: new Date(input.firstDueAt),
        repeatRule,
        createdBy: actor,
        relatedTaskId: input.relatedTaskId ?? null,
        idempotencyKey: `recurring:${actor.name}:${input.title}:${repeatRule.cron ?? `${repeatRule.every}:${repeatRule.interval}`}`,
      });
      return { reminderId: reminder._id, repeatRule: reminder.repeatRule, firstDueAt: reminder.dueAt };
    },
  });

  reg.register({
    name: 'list_reminders',
    description: 'List reminders (optionally per user, or by status).',
    tier: 'read',
    input: z.object({ userId: z.string().optional(), status: z.enum(['scheduled', 'sent', 'snoozed', 'cancelled', 'failed']).optional(), limit: z.number().int().min(1).max(100).default(50) }),
    handler: ({ orgId }, input) => listReminders(orgId, input),
  });
}
