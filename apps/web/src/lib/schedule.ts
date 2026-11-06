import type { RepeatRule } from './api';

const CRON_LABEL: Record<string, string> = {
  '30 8 * * *': 'Daily · 08:30',
  '0 9 * * *': 'Daily · 09:00',
  '0 10 * * *': 'Daily · 10:00',
  '30 10 * * *': 'Daily · 10:30',
  '0 */6 * * *': 'Every 6 hours',
  '0 */12 * * *': 'Every 12 hours',
  '0 * * * *': 'Hourly',
};

const JOB_LABEL: Record<string, string> = {
  reminder: 'Reminder',
  morning_brief: 'Morning brief',
  overdue_scan: 'Overdue scan',
  deadline_followup: 'Deadline follow-ups',
  commitment_check: 'Commitment checks',
  stale_task_scan: 'Stale task scan',
};

export function jobLabel(kind: string) {
  return JOB_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

export function repeatLabel(rule?: RepeatRule | null) {
  if (!rule) return 'One-off';
  if (rule.every === 'cron') {
    const cron = rule.cron ?? '';
    return CRON_LABEL[cron] ?? `Cron · ${cron || 'custom'}`;
  }
  const interval = rule.interval ?? 1;
  const unit = rule.every;
  if (interval <= 1) {
    if (unit === 'minute') return 'Every minute';
    if (unit === 'hour') return 'Hourly';
    if (unit === 'day') return 'Daily';
    if (unit === 'week') return 'Weekly';
  }
  const plural = interval === 1 ? unit : `${unit}s`;
  return `Every ${interval} ${plural}`;
}

export function timeUntil(value?: string | null) {
  if (!value) return '—';
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const prefix = diff < 0 ? 'overdue ' : 'in ';
  if (mins < 1) return diff < 0 ? 'due now' : 'in <1m';
  if (mins < 60) return `${prefix}${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${prefix}${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return diff < 0 ? 'yesterday' : 'tomorrow';
  return `${prefix}${days}d`;
}

export function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function describeCadence(rule?: RepeatRule | null) {
  if (!rule) return 'Runs once';
  if (rule.every === 'cron') return `Cron ${rule.cron ?? ''}`.trim();
  return `Every ${rule.interval ?? 1} ${rule.every}${(rule.interval ?? 1) === 1 ? '' : 's'}`;
}
