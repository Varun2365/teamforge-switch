import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App, Button, Card, Col, Popconfirm, Row, Skeleton, Space, Table, Tag, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClearOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined,
  SyncOutlined, ThunderboltOutlined, WarningOutlined, BellOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { api } from '../lib/api';
import { timeUntil } from '../lib/schedule';
import { PageHeader, formatDateTime, timeAgo } from '../components/ui';

interface QueueJob { id: string; kind: string; runAt: string; status: string; attempts: number; lastError?: string | null; repeatRule?: { every: string } | null }
interface QueueReminder { id: string; title: string; dueAt: string; status: string; userId?: string | null; roomId?: string | null; repeatRule?: { every: string } | null }
interface StuckMessage { id: string; sender?: string; body?: string; createdAt: string; status?: string }
interface QueueSnapshot {
  schedulerPaused: boolean;
  runtime: null | { activeRoomQueues: number; connectedAgents: number; totalAgents: number; roomId: string | null; roomName: string };
  stats: { messagesLastHour: number; repliedLastHour: number; processing: number; errorsLastHour: number };
  pendingJobs: QueueJob[];
  reminders: QueueReminder[];
  stuck: StuckMessage[];
  notifications: Array<{ id: string; title?: string; body: string; kind: string; status: string; deliveredVia?: string; at: string }>;
}

function Metric({ label, value, foot, tone = 'default' }: { label: string; value: React.ReactNode; foot: string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  return (
    <div className={`pulse-metric${tone === 'default' ? '' : ` is-${tone}`}`}>
      <div className="pulse-metric-top"><span className="pulse-label">{label}</span></div>
      <div className="pulse-value" style={{ fontSize: 26 }}>{value}</div>
      <div className="pulse-foot">{foot}</div>
    </div>
  );
}

export default function QueuePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['queue'],
    queryFn: () => api<QueueSnapshot>('/api/queue'),
    refetchInterval: 5000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['queue'] });
  const pause = useMutation({
    mutationFn: (paused: boolean) => api('/api/queue/pause', { method: 'POST', body: JSON.stringify({ paused }) }),
    onSuccess: () => { message.success('Scheduler updated'); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });
  const cancelJobs = useMutation({
    mutationFn: (kind?: string) => api<{ cancelled: number }>('/api/queue/cancel-jobs', { method: 'POST', body: JSON.stringify({ kind }) }),
    onSuccess: (r) => { message.success(`Cancelled ${r.cancelled ?? 0} job(s)`); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });
  const cleanStuck = useMutation({
    mutationFn: () => api<{ cleaned: number }>('/api/queue/clean-stuck', { method: 'POST' }),
    onSuccess: (r) => { message.success(`Cleared ${r.cleaned ?? 0} stuck message(s)`); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });
  const recreateChannel = useMutation({
    mutationFn: () => api<{ channelId?: string }>('/api/queue/recreate-channel', { method: 'POST' }),
    onSuccess: (r) => { message.success(r.channelId ? `Fresh Discord channel created: ${r.channelId}` : 'Room recreated'); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });
  const cancelJob = useMutation({
    mutationFn: (id: string) => api(`/api/queue/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('Job cancelled'); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });
  const cancelReminder = useMutation({
    mutationFn: (id: string) => api(`/api/queue/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => { message.success('Reminder cancelled'); refresh(); },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed'),
  });

  const jobColumns: ColumnsType<QueueJob> = [
    { title: 'Kind', dataIndex: 'kind', render: (v: string) => <span className="font-mono text-[12px]">{v}</span> },
    { title: 'Runs at', dataIndex: 'runAt', render: (v: string) => <span title={formatDateTime(v)}>{formatDateTime(v)}</span> },
    { title: 'Repeat', dataIndex: 'repeatRule', render: (r?: { every: string } | null) => (r ? <Tag>{r.every}</Tag> : <Tag>once</Tag>) },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={v === 'pending' ? 'gold' : v === 'running' ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'Tries', dataIndex: 'attempts', width: 70 },
    {
      title: '', width: 70, align: 'right',
      render: (_: unknown, r: QueueJob) => (
        <Popconfirm title="Cancel this job?" onConfirm={() => cancelJob.mutate(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={r.status !== 'pending'} />
        </Popconfirm>
      ),
    },
  ];

  const reminderColumns: ColumnsType<QueueReminder> = [
    { title: 'Reminder', dataIndex: 'title', render: (v: string, r) => <div><div className="font-medium">{v}</div>{r.repeatRule && <Tag className="mt-1">{r.repeatRule.every}</Tag>}</div> },
    { title: 'Due', dataIndex: 'dueAt', render: (v: string) => <span title={formatDateTime(v)}>{timeUntil(v)}</span> },
    { title: 'Target', render: (_: unknown, r) => <span className="text-[11px] text-[var(--color-ink-3)]">{r.roomId ? 'room' : r.userId ? 'person' : 'room'}</span> },
    {
      title: '', width: 70, align: 'right',
      render: (_: unknown, r: QueueReminder) => (
        <Popconfirm title="Cancel this reminder?" onConfirm={() => cancelReminder.mutate(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const stuckColumns: ColumnsType<StuckMessage> = [
    { title: 'Sender', dataIndex: 'sender', width: 140 },
    { title: 'Message', dataIndex: 'body', render: (v?: string) => <span className="text-[12px] text-[var(--color-ink-2)]">{v || '—'}</span> },
    { title: 'Received', dataIndex: 'createdAt', width: 120, render: (v: string) => <span title={formatDateTime(v)}>{timeAgo(v)}</span> },
  ];

  const summary = useMemo(() => {
    if (!data) return null;
    return data;
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Queue & proactive control"
        description="Everything an agent is holding or about to send: scheduler jobs, reminders, stuck messages and the live Switch ingest queue."
        extra={<Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()}>Refresh</Button>}
      />

      {isError && <Alert type="error" showIcon message="Could not load the queue" description={error instanceof Error ? error.message : 'API unreachable'} />}

      {isLoading || !summary ? (
        <Skeleton active />
      ) : (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}><Metric label="Scheduler" value={summary.schedulerPaused ? 'Paused' : 'Running'} foot={summary.schedulerPaused ? 'Proactive delivery off' : 'Proactive delivery on'} tone={summary.schedulerPaused ? 'warning' : 'success'} /></Col>
            <Col xs={12} md={6}><Metric label="Pending jobs" value={summary.pendingJobs.filter((j) => j.status === 'pending').length} foot="Scheduled deliveries & scans" /></Col>
            <Col xs={12} md={6}><Metric label="Active reminders" value={summary.reminders.length} foot="Waiting to fire" /></Col>
            <Col xs={12} md={6}><Metric label="Stuck / processing" value={summary.stats.processing} foot={`${summary.stats.errorsLastHour} error(s) last hour`} tone={summary.stats.processing > 0 ? 'warning' : 'default'} /></Col>
          </Row>

          <Card size="small" title={<Space><ThunderboltOutlined />Controls</Space>}>
            <Space wrap>
              <Button
                type={summary.schedulerPaused ? 'primary' : 'default'}
                icon={summary.schedulerPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                loading={pause.isPending}
                onClick={() => pause.mutate(!summary.schedulerPaused)}
              >
                {summary.schedulerPaused ? 'Resume proactive' : 'Pause proactive'}
              </Button>
              <Popconfirm title="Cancel every pending scheduled job and active reminder?" description="Useful after tests or before a demo." onConfirm={() => cancelJobs.mutate(undefined)}>
                <Button danger icon={<ClearOutlined />} loading={cancelJobs.isPending}>Cancel all pending jobs</Button>
              </Popconfirm>
              <Popconfirm title="Cancel pending reminder jobs and their reminders?" onConfirm={() => cancelJobs.mutate('reminder')}>
                <Button icon={<BellOutlined />} loading={cancelJobs.isPending}>Cancel all reminders</Button>
              </Popconfirm>
              <Popconfirm title="Mark stuck messages as errored?" onConfirm={() => cleanStuck.mutate()}>
                <Button icon={<WarningOutlined />} loading={cleanStuck.isPending}>Clean stuck messages</Button>
              </Popconfirm>
              <Popconfirm
                title="Create a fresh Discord channel for this room?"
                description="Switch provisions a new channel, all six agents move to it, and the old room is archived."
                onConfirm={() => recreateChannel.mutate()}
              >
                <Button icon={<SyncOutlined />} loading={recreateChannel.isPending}>Recreate Discord channel</Button>
              </Popconfirm>
            </Space>
            <div className="mt-3 text-[11px] text-[var(--color-ink-3)]">
              Recurring jobs (morning brief, overdue scan, deadline follow-up) are normal and run daily — cancel them only if you want a fully quiet demo. Pausing stops all proactive delivery without deleting anything.
            </div>
          </Card>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" title={`Pending scheduled jobs (${summary.pendingJobs.length})`} extra={<Tag icon={<SyncOutlined />}>{summary.runtime?.activeRoomQueues ?? 0} live room queue(s)</Tag>}>
                <Table<QueueJob> size="small" rowKey="id" columns={jobColumns} dataSource={summary.pendingJobs} pagination={{ pageSize: 8, hideOnSinglePage: true }} />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" title={`Active reminders (${summary.reminders.length})`}>
                <Table<QueueReminder> size="small" rowKey="id" columns={reminderColumns} dataSource={summary.reminders} pagination={{ pageSize: 8, hideOnSinglePage: true }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <Card size="small" title={`Stuck messages (${summary.stuck.length})`}>
                <Table<StuckMessage> size="small" rowKey="id" columns={stuckColumns} dataSource={summary.stuck} pagination={{ pageSize: 6, hideOnSinglePage: true }} />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" title="Recent proactive deliveries">
                <div className="space-y-2">
                  {summary.notifications.length === 0 && <div className="text-[12px] text-[var(--color-ink-3)]">Nothing delivered yet.</div>}
                  {summary.notifications.map((n) => (
                    <div key={n.id} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{n.kind}</span>
                        <Tag color={n.status === 'sent' ? 'green' : n.status === 'failed' ? 'red' : 'default'}>{n.status}</Tag>
                      </div>
                      <div className="font-medium">{n.title || 'Update'}</div>
                      <div className="text-[var(--color-ink-2)]">{n.body.slice(0, 180)}</div>
                      <div className="text-[9px] text-[var(--color-ink-3)]">{n.deliveredVia ?? 'dashboard'} · {timeAgo(n.at)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            message="What this page is for"
            description="The 'queue' is three things: scheduled jobs (proactive deliveries), active reminders, and messages currently being processed. If a test run or a burst leaves things pending, pause proactive, cancel pending jobs, clean stuck messages, then resume. Nothing here deletes organizational memory."
          />
        </>
      )}
    </div>
  );
}
