import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  List,
  Popconfirm,
  Row,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  ReloadOutlined,
  RightOutlined,
  ScheduleOutlined,
  SyncOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { api, type Reminder, type ScheduledJob } from '../lib/api';
import { keys, usePeople, useReminders, useScheduledJobs, useSwitchStatus } from '../lib/hooks';
import { isToday, jobLabel, repeatLabel, timeUntil } from '../lib/schedule';
import {
  Drawer,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDateTime,
  statusChip,
  timeAgo,
} from '../components/ui';

type ReminderFilter = 'all' | 'scheduled' | 'sent';
type JobFilter = 'pending' | 'all';

function ScheduleMetric({
  label,
  value,
  foot,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  foot: string;
  icon: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  return (
    <div className={`pulse-metric${tone === 'default' ? '' : ` is-${tone}`}`}>
      <div className="pulse-metric-top">
        <span className="pulse-label">{label}</span>
        <span className="pulse-icon">{icon}</span>
      </div>
      <div className="pulse-value" style={{ fontSize: 26 }}>
        {value}
      </div>
      <div className="pulse-foot">{foot}</div>
    </div>
  );
}

export default function ScheduledPage() {
  const reminders = useReminders();
  const jobs = useScheduledJobs();
  const people = usePeople();
  const switchStatus = useSwitchStatus();
  const org = useQuery({
    queryKey: ['org-current'],
    queryFn: () => api<Record<string, unknown>>('/api/organizations/current'),
    staleTime: 60_000,
  });
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const [reminderFilter, setReminderFilter] = useState<ReminderFilter>('all');
  const [jobFilter, setJobFilter] = useState<JobFilter>('pending');
  const [selected, setSelected] = useState<Reminder | null>(null);

  const cancelReminder = useMutation({
    mutationFn: (id: string) => api(`/api/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.reminders });
      queryClient.invalidateQueries({ queryKey: keys.scheduledJobs });
      message.success('Reminder cancelled.');
      setSelected(null);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );

  const reminderList = reminders.data ?? [];
  const jobList = jobs.data ?? [];
  const scheduleError = reminders.isError || jobs.isError;
  const scheduleErrorMessage = reminders.error ?? jobs.error;
  const retrySchedule = () => {
    reminders.refetch();
    jobs.refetch();
  };

  const filteredReminders = reminderList.filter((reminder) => {
    if (reminderFilter === 'all') return true;
    if (reminderFilter === 'scheduled') return reminder.status === 'scheduled' || reminder.status === 'snoozed';
    return reminder.status === reminderFilter;
  });

  const filteredJobs = jobList
    .filter((job) => (jobFilter === 'pending' ? job.status === 'pending' : true))
    .sort((a, b) => {
      const aPending = a.status === 'pending' ? 0 : 1;
      const bPending = b.status === 'pending' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return new Date(a.runAt).getTime() - new Date(b.runAt).getTime();
    });

  const upcoming = useMemo(() => {
    const items: Array<{
      key: string;
      kind: string;
      title: string;
      at: string;
      status: string;
      icon: React.ReactNode;
      reminder: Reminder | null;
    }> = [];

    for (const reminder of reminderList) {
      if (reminder.status !== 'scheduled' && reminder.status !== 'snoozed') continue;
      items.push({
        key: `reminder-${reminder._id}`,
        kind: 'Reminder',
        title: reminder.title,
        at: reminder.dueAt,
        status: reminder.status,
        icon: <BellOutlined />,
        reminder,
      });
    }

    for (const job of jobList) {
      if (job.status !== 'pending') continue;
      items.push({
        key: `job-${job._id}`,
        kind: 'Scheduler job',
        title: jobLabel(job.kind),
        at: job.runAt,
        status: job.status,
        icon: job.kind === 'reminder' ? <BellOutlined /> : <SyncOutlined />,
        reminder: null,
      });
    }

    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 6);
  }, [jobList, reminderList]);

  const scheduledReminders = reminderList.filter((reminder) => reminder.status === 'scheduled' || reminder.status === 'snoozed').length;
  const pendingJobs = jobList.filter((job) => job.status === 'pending').length;
  const recurringJobs = jobList.filter((job) => job.repeatRule).length;
  const sentToday = reminderList.filter((reminder) => reminder.status === 'sent' && isToday(reminder.lastSentAt)).length;
  const nextRun = upcoming[0]?.at;
  const quietHours = org.data?.quietHours as { start?: string; end?: string } | undefined;

  function recipientLabel(reminder: Reminder) {
    if (reminder.userId) return peopleById.get(reminder.userId) ?? 'A person';
    return 'Switch room';
  }

  const reminderColumns: ColumnsType<Reminder> = [
    {
      title: 'Message',
      dataIndex: 'title',
      render: (title: string, reminder) => (
        <div>
          <div className="cell-primary" style={{ fontWeight: 500 }}>
            {title}
          </div>
          {reminder.body && (
            <div
              className="cell-secondary"
              style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {reminder.body}
            </div>
          )}
          <div className="cell-secondary" style={{ marginTop: 2 }}>
            {reminder.userId ? <UserOutlined style={{ marginInlineEnd: 4 }} /> : <HomeOutlined style={{ marginInlineEnd: 4 }} />}
            {recipientLabel(reminder)}
          </div>
        </div>
      ),
    },
    {
      title: 'Due',
      dataIndex: 'dueAt',
      width: 158,
      render: (value: string) => (
        <div>
          <div className="cell-primary" style={{ fontWeight: 500 }}>
            {formatDateTime(value)}
          </div>
          <div className="cell-secondary">{timeUntil(value)}</div>
        </div>
      ),
    },
    {
      title: 'Repeat',
      dataIndex: 'repeatRule',
      width: 132,
      render: (rule) => <span className="cell-secondary">{repeatLabel(rule)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => statusChip(status),
    },
    {
      title: '',
      width: 36,
      render: () => <RightOutlined style={{ fontSize: 10, color: '#64748b' }} />,
    },
  ];

  const jobColumns: ColumnsType<ScheduledJob> = [
    {
      title: 'Job',
      dataIndex: 'kind',
      render: (kind: string, job) => (
        <div>
          <div className="cell-primary" style={{ fontWeight: 500 }}>
            {jobLabel(kind)}
          </div>
          <div className="cell-secondary mono">{job.idempotencyKey ?? job._id.slice(0, 8)}</div>
        </div>
      ),
    },
    {
      title: 'Cadence',
      dataIndex: 'repeatRule',
      width: 150,
      render: (rule) => <span className="cell-secondary">{repeatLabel(rule)}</span>,
    },
    {
      title: 'Next run',
      dataIndex: 'runAt',
      width: 158,
      render: (value: string) => (
        <div>
          <div className="cell-primary" style={{ fontWeight: 500 }}>
            {formatDateTime(value)}
          </div>
          <div className="cell-secondary">{timeUntil(value)}</div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => statusChip(status),
    },
    {
      title: 'Attempts',
      dataIndex: 'attempts',
      width: 96,
      align: 'right',
      render: (attempts: number, job) => (
        <span className="number-cell">
          {attempts}/{job.maxAttempts}
        </span>
      ),
    },
    {
      title: 'Last error',
      dataIndex: 'lastError',
      width: 220,
      render: (error: string | null) =>
        error ? (
          <Tooltip title={error}>
            <span style={{ color: '#dc2626', fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {error}
            </span>
          </Tooltip>
        ) : (
          <span className="cell-secondary">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Scheduled messages"
        description="The proactive pipeline: reminders and recurring jobs queued to fire into the Switch room. The scheduler checks every five seconds and persists every job."
        extra={
          <Space size={8} wrap>
            {scheduleError ? (
              <Tag color="error" variant="filled" style={{ marginInlineEnd: 0 }}>
                Schedule unavailable
              </Tag>
            ) : (
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                <ScheduleOutlined style={{ marginInlineEnd: 5 }} />
                {scheduledReminders + pendingJobs} queued
              </Tag>
            )}
            <Button
              icon={<ReloadOutlined />}
              loading={reminders.isFetching || jobs.isFetching}
              onClick={retrySchedule}
            >
              Refresh
            </Button>
          </Space>
        }
      />

      <div className="section-stack">
        {scheduleError ? (
          <ErrorBox error={scheduleErrorMessage} onRetry={retrySchedule} />
        ) : (
          <Card className="tf-card pulse-card" variant="outlined">
            <div className="schedule-grid">
            <ScheduleMetric
              label="Scheduled reminders"
              value={scheduledReminders}
              foot="Waiting to send"
              icon={<BellOutlined />}
              tone={scheduledReminders > 0 ? 'warning' : 'default'}
            />
            <ScheduleMetric
              label="Upcoming jobs"
              value={pendingJobs}
              foot="Queued to run"
              icon={<ClockCircleOutlined />}
              tone={pendingJobs > 0 ? 'warning' : 'default'}
            />
            <ScheduleMetric
              label="Next run"
              value={nextRun ? timeUntil(nextRun) : '—'}
              foot={nextRun ? formatDateTime(nextRun) : 'Nothing queued'}
              icon={<SyncOutlined />}
            />
            <ScheduleMetric
              label="Reminders sent"
              value={sentToday}
              foot="Today"
              icon={<CheckCircleOutlined />}
              tone={sentToday > 0 ? 'success' : 'default'}
            />
          </div>
          </Card>
        )}

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={15}>
            <Panel
              flush
              title="Reminders"
              action={
                <Segmented
                  size="small"
                  value={reminderFilter}
                  onChange={(value) => setReminderFilter(value as ReminderFilter)}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Scheduled', value: 'scheduled' },
                    { label: 'Sent', value: 'sent' },
                  ]}
                />
              }
            >
              {reminders.isError ? (
                <div style={{ padding: 20 }}>
                  <ErrorBox error={reminders.error} onRetry={() => reminders.refetch()} />
                </div>
              ) : reminders.isLoading ? (
                <div style={{ padding: 20 }}>
                  <Skeleton active paragraph={{ rows: 5 }} />
                </div>
              ) : (
                <Table
                  rowKey="_id"
                  columns={reminderColumns}
                  dataSource={filteredReminders}
                  pagination={false}
                  scroll={{ x: 560 }}
                  onRow={(reminder) => ({
                    onClick: () => setSelected(reminder),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(reminder);
                      }
                    },
                    className: 'clickable-row',
                    tabIndex: 0,
                  })}
                  locale={{
                    emptyText: (
                      <Empty
                        title="No reminders in this view."
                        hint="Reminders are created when someone asks TEAMFORGE to follow up, or when the scheduler needs to chase a deadline."
                      />
                    ),
                  }}
                />
              )}
            </Panel>
          </Col>

          <Col xs={24} xl={9}>
            <div className="section-stack" style={{ gap: 20 }}>
              <Panel title="Next up" action={<span className="panel-caption">Across reminders and jobs</span>}>
                {scheduleError ? (
                  <ErrorBox error={scheduleErrorMessage} onRetry={retrySchedule} />
                ) : reminders.isLoading || jobs.isLoading ? (
                  <Skeleton active paragraph={{ rows: 5 }} />
                ) : upcoming.length === 0 ? (
                  <Empty title="Nothing queued." hint="The proactive pipeline is idle right now." />
                ) : (
                  <List
                    dataSource={upcoming}
                    split={false}
                    renderItem={(item, index) => (
                      <div
                        key={item.key}
                        role={item.reminder ? 'button' : undefined}
                        tabIndex={item.reminder ? 0 : undefined}
                        onClick={() => item.reminder && setSelected(item.reminder)}
                        onKeyDown={(event) => {
                          if (item.reminder && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            setSelected(item.reminder);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 0',
                          borderBottom: index === upcoming.length - 1 ? 'none' : '1px solid #eef2f7',
                          cursor: item.reminder ? 'pointer' : 'default',
                        }}
                      >
                        <span className="attention-icon" style={{ flex: '0 0 28px', width: 28, height: 28 }}>
                          {item.icon}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="cell-primary" style={{ fontWeight: 500, lineHeight: 1.4 }}>
                            {item.title}
                          </div>
                          <div className="cell-secondary">
                            {item.kind} · {formatDateTime(item.at)}
                          </div>
                        </div>
                        <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                          {timeUntil(item.at)}
                        </span>
                      </div>
                    )}
                  />
                )}
              </Panel>

              <Panel title="Delivery rules">
                <Descriptions
                  column={1}
                  size="small"
                  colon={false}
                  labelStyle={{ width: 132, color: '#64748b' }}
                  items={[
                    { key: 'cadence', label: 'Scheduler', children: 'Every 5 seconds' },
                    {
                      key: 'quiet',
                      label: 'Quiet hours',
                      children: `${quietHours?.start ?? '—'} → ${quietHours?.end ?? '—'}`,
                    },
                    {
                      key: 'cap',
                      label: 'Proactive cap',
                      children: `${String(org.data?.maxProactivePerDay ?? '—')} / day / person`,
                    },
                    {
                      key: 'room',
                      label: 'Delivery',
                      children: (
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          {switchStatus.data?.runtime?.roomName ?? 'Shared Switch room'}
                        </span>
                      ),
                    },
                    { key: 'retries', label: 'Retries', children: 'Up to 3 attempts' },
                  ]}
                />
                <div style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.6, color: '#475569' }}>
                  Jobs persist in MongoDB across restarts. Quiet hours and the daily cap are checked before anything is
                  delivered to the room.
                </div>
              </Panel>
            </div>
          </Col>
        </Row>

        <Panel
          flush
          title="Scheduler jobs"
          action={
            <Segmented
              size="small"
              value={jobFilter}
              onChange={(value) => setJobFilter(value as JobFilter)}
              options={[
                { label: 'Upcoming', value: 'pending' },
                { label: 'All', value: 'all' },
              ]}
            />
          }
        >
          {jobs.isError ? (
            <div style={{ padding: 20 }}>
              <ErrorBox error={jobs.error} onRetry={() => jobs.refetch()} />
            </div>
          ) : jobs.isLoading ? (
            <div style={{ padding: 20 }}>
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          ) : (
            <Table
              rowKey="_id"
              columns={jobColumns}
              dataSource={filteredJobs}
              pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 900 }}
              locale={{
                emptyText: (
                  <Empty
                    title="No jobs in this view."
                    hint="Recurring proactive jobs are created when the workspace is bootstrapped; reminders are added as they are requested."
                  />
                ),
              }}
            />
          )}
        </Panel>
      </div>

      {selected && (
        <Drawer title="Scheduled message" onClose={() => setSelected(null)} width={520}>
          <div className="section-stack" style={{ gap: 20 }}>
            <div>
              <Space size={6} wrap>
                {statusChip(selected.status)}
                <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                  {repeatLabel(selected.repeatRule)}
                </Tag>
              </Space>
              <h2 className="detail-title" style={{ marginTop: 10 }}>
                {selected.title}
              </h2>
              {selected.body && <p className="detail-subtitle">{selected.body}</p>}
            </div>

            <Descriptions
              column={1}
              size="small"
              colon={false}
              labelStyle={{ width: 150, color: '#64748b' }}
              items={[
                { key: 'due', label: 'Due', children: `${formatDateTime(selected.dueAt)} · ${timeUntil(selected.dueAt)}` },
                { key: 'recipient', label: 'Recipient', children: recipientLabel(selected) },
                { key: 'repeat', label: 'Cadence', children: repeatLabel(selected.repeatRule) },
                {
                  key: 'created',
                  label: 'Created by',
                  children: selected.createdBy?.name
                    ? `${selected.createdBy.type ?? 'actor'} · ${selected.createdBy.name}`
                    : '—',
                },
                {
                  key: 'lastSent',
                  label: 'Last sent',
                  children: selected.lastSentAt ? formatDateTime(selected.lastSentAt) : 'Not sent yet',
                },
                { key: 'sent', label: 'Sent count', children: String(selected.sentCount ?? 0) },
                { key: 'room', label: 'Room', children: selected.roomId ? <span className="mono">{selected.roomId}</span> : 'Shared room' },
                {
                  key: 'override',
                  label: 'Quiet hours',
                  children: selected.quietHoursOverride ? 'Override allowed' : 'Respects quiet hours',
                },
                ...(selected.relatedTaskId
                  ? [{ key: 'task', label: 'Related task', children: <span className="mono">{selected.relatedTaskId}</span> }]
                  : []),
                ...(selected.relatedCommitmentId
                  ? [{ key: 'commitment', label: 'Commitment', children: <span className="mono">{selected.relatedCommitmentId}</span> }]
                  : []),
              ]}
            />

            {selected.status === 'sent' && (
              <Alert
                type="success"
                showIcon
                message="Delivered"
                description={`This message was delivered ${selected.lastSentAt ? timeAgo(selected.lastSentAt) : 'already'}. The scheduler keeps the delivery record.`}
              />
            )}

            {(selected.status === 'scheduled' || selected.status === 'snoozed') && (
              <>
                <div className="soft-divider" style={{ margin: 0 }} />
                <Popconfirm
                  title="Cancel this reminder?"
                  description="It will not be sent. The audit record is kept."
                  okText="Cancel reminder"
                  cancelText="Keep it"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => cancelReminder.mutate(selected._id)}
                >
                  <Button danger icon={<WarningOutlined />} loading={cancelReminder.isPending}>
                    Cancel reminder
                  </Button>
                </Popconfirm>
              </>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}
