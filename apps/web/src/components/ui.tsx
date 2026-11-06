import type { ReactNode } from 'react';
import { Alert, Button as AntButton, Card, Drawer as AntDrawer, Empty as AntEmpty, Input, Select, Skeleton, Tag, Typography } from 'antd';
import type { ButtonProps } from 'antd';
import { clsx } from '../lib/clsx';

export { Input, Select };

export function Button({ variant = 'primary', ...props }: Omit<ButtonProps, 'variant'> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <AntButton type={variant === 'ghost' ? 'default' : 'primary'} danger={variant === 'danger'} {...props} />;
}

export function PageHeader({
  title,
  description,
  extra,
}: {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <Typography.Title level={2} className="page-title">
          {title}
        </Typography.Title>
        {description && (
          <Typography.Paragraph className="page-description">{description}</Typography.Paragraph>
        )}
      </div>
      {extra && <div className="page-header-extra">{extra}</div>}
    </header>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <Card
      className={clsx('tf-card', flush && 'is-flush', className)}
      title={title}
      extra={action}
      variant="outlined"
    >
      {children}
    </Card>
  );
}

const CHIP_TONE: Record<string, string> = {
  ok: 'success',
  warn: 'warning',
  danger: 'error',
  info: 'blue',
  neutral: 'default',
  accent: 'blue',
};

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';
  children: ReactNode;
}) {
  return (
    <Tag color={CHIP_TONE[tone]} variant="filled" style={{ marginInlineEnd: 0 }}>
      {children}
    </Tag>
  );
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  done: 'ok',
  completed: 'ok',
  approved: 'ok',
  on_track: 'ok',
  active: 'info',
  in_progress: 'info',
  planning: 'neutral',
  todo: 'neutral',
  pending: 'warn',
  scheduled: 'info',
  sent: 'ok',
  snoozed: 'warn',
  running: 'info',
  failed: 'danger',
  at_risk: 'warn',
  blocked: 'danger',
  off_track: 'danger',
  rejected: 'danger',
  disputed: 'danger',
  cancelled: 'neutral',
  superseded: 'neutral',
};

export function displayLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export function statusChip(status: string) {
  return <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{displayLabel(status)}</Chip>;
}

export function healthChip(health: string) {
  if (health === 'on_track') return <Chip tone="ok">On track</Chip>;
  if (health === 'at_risk') return <Chip tone="warn">At risk</Chip>;
  return <Chip tone="danger">Off track</Chip>;
}

export function priorityChip(priority: string) {
  const tone = priority === 'urgent' ? 'danger' : priority === 'high' ? 'warn' : priority === 'low' ? 'neutral' : 'info';
  return <Chip tone={tone}>{priority}</Chip>;
}

export function Drawer({
  title,
  onClose,
  children,
  width = 480,
  extra,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  extra?: ReactNode;
}) {
  return (
    <AntDrawer title={title} open onClose={onClose} width={width} extra={extra} destroyOnHidden>
      {children}
    </AntDrawer>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <AntEmpty image={AntEmpty.PRESENTED_IMAGE_SIMPLE} description={null} />
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Alert
      type="error"
      showIcon
      message="Couldn't load this"
      description={msg}
      action={
        onRetry ? (
          <AntButton size="small" onClick={onRetry}>
            Retry
          </AntButton>
        ) : undefined
      }
    />
  );
}

export function Spinner() {
  return (
    <div className="loading-block">
      <Skeleton active title={false} paragraph={{ rows: 4 }} />
    </div>
  );
}

export function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDateTime(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function timeAgo(d?: string | Date | null) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Turn raw tool-call payloads into a short human summary; keep the raw text for a tooltip. */
export function summarizeActivity(action: string, summary?: string | null, error?: string | null) {
  if (error) return error;
  if (!summary) return 'No summary recorded.';
  if (action !== 'tool_call') return summary;

  const detail = /detail=([^·]+)/.exec(summary)?.[1]?.trim();
  if (detail) return detail;

  const name = /name=([^·]+)/.exec(summary)?.[1]?.trim();
  const title = /title=([^·]+)/.exec(summary)?.[1]?.trim();
  if (name) return title ? `${title} · ${name}` : name;

  const status = /status=([^·]+)/.exec(summary)?.[1]?.trim();
  const normalized = /normalized=([^·]+)/.exec(summary)?.[1]?.trim();
  if (status) return normalized ? `${status.replace(/_/g, ' ')} · ${normalized}` : status.replace(/_/g, ' ');

  const kind = /kind=([^·]+)/.exec(summary)?.[1]?.trim();
  if (kind) return kind.replace(/_/g, ' ');

  if (/^[\w-]+=/.test(summary)) return 'Tool call completed';
  return summary;
}
