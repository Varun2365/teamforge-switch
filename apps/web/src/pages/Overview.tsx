import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, List, Row, Skeleton, Space, Table, Tag, Timeline, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  ProjectOutlined,
  RobotOutlined,
  StopOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useOverview, useReminders, useScheduledJobs, useSwitchStatus } from '../lib/hooks';
import type { Overview } from '../lib/api';
import { jobLabel, timeUntil } from '../lib/schedule';
import {
  Chip,
  ErrorBox,
  PageHeader,
  Panel,
  formatDate,
  formatDateTime,
  formatLongDate,
  healthChip,
  priorityChip,
  statusChip,
  summarizeActivity,
  timeAgo,
} from '../components/ui';

type PulseTone = 'default' | 'warning' | 'danger' | 'success';

function PulseMetric({
  label,
  value,
  foot,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  foot: string;
  icon: React.ReactNode;
  tone?: PulseTone;
}) {
  return (
    <div className={`pulse-metric${tone === 'default' ? '' : ` is-${tone}`}`}>
      <div className="pulse-metric-top">
        <span className="pulse-label">{label}</span>
        <span className="pulse-icon">{icon}</span>
      </div>
      <div className="pulse-value">{value}</div>
      <div className="pulse-foot">{foot}</div>
    </div>
  );
}

function decisionByLabel(decidedBy?: string[]) {
  const named = (decidedBy ?? []).filter((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value));
  return named.length ? ` · ${named.join(', ')}` : '';
}

function AttentionTile({
  to,
  icon,
  tone,
  title,
  description,
  count,
  countTone,
}: {
  to: string;
  icon: React.ReactNode;
  tone?: 'danger' | 'warning';
  title: string;
  description: string;
  count: React.ReactNode;
  countTone?: string;
}) {
  return (
    <Link to={to} className="attention-item" style={{ color: 'inherit' }}>
      <span className={`attention-icon${tone ? ` is-${tone}` : ''}`}>{icon}</span>
      <span className="attention-copy">
        <span className="attention-title">{title}</span>
        <span className="attention-desc">{description}</span>
      </span>
      <span className="attention-count" style={countTone ? { color: countTone } : undefined}>
        {count}
      </span>
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="section-stack">
      <Skeleton active paragraph={{ rows: 5 }} />
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useOverview();
  const { data: sw, isLoading: switchLoading } = useSwitchStatus();
  const reminders = useReminders();
  const jobs = useScheduledJobs();

  const live = sw?.server === 'reachable';
  const online = sw?.runtime?.onlineAgents ?? 0;
  const total = sw?.runtime?.agents.length ?? 6;

  const header = (
    <PageHeader
      title="Operations overview"
      description={`The live state of the organization — ${formatLongDate()}. Every number below is grounded in tool data.`}
      extra={
        <Space size={8} wrap>
          <Tag
            color={switchLoading ? 'default' : live ? 'success' : 'warning'}
            variant="filled"
            style={{ marginInlineEnd: 0 }}
          >
            {switchLoading ? 'Checking Switch…' : live ? `Switch live · ${online}/${total} agents` : 'Switch unreachable'}
          </Tag>
          {data && data.pendingApprovals > 0 && (
            <Link to="/approvals">
              <Button type="primary">
                Review {data.pendingApprovals} approval{data.pendingApprovals === 1 ? '' : 's'}
              </Button>
            </Link>
          )}
        </Space>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <OverviewSkeleton />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        {header}
        <ErrorBox error={error} onRetry={() => refetch()} />
      </>
    );
  }

  const atRisk = data.projects.filter((project) => project.health !== 'on_track');
  const projectNames = atRisk.slice(0, 3).map((project) => project.name).join(', ');

  const scheduledUpcoming = [
    ...(reminders.data ?? [])
      .filter((reminder) => reminder.status === 'scheduled' || reminder.status === 'snoozed')
      .map((reminder) => ({
        key: `reminder-${reminder._id}`,
        title: reminder.title,
        kind: 'Reminder',
        at: reminder.dueAt,
      })),
    ...(jobs.data ?? [])
      .filter((job) => job.status === 'pending')
      .map((job) => ({
        key: `job-${job._id}`,
        title: jobLabel(job.kind),
        kind: 'Scheduler',
        at: job.runAt,
      })),
  ]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 4);

  const scheduleError = reminders.isError || jobs.isError;
  const scheduleErrorMessage = reminders.error ?? jobs.error;
  const retrySchedule = () => {
    reminders.refetch();
    jobs.refetch();
  };

  const projectColumns: ColumnsType<Overview['projects'][number]> = [
    {
      title: 'Project',
      dataIndex: 'name',
      render: (name: string, project) => (
        <div>
          <div className="cell-primary">{name}</div>
          <div className="cell-secondary">Due {formatDate(project.dueDate)}</div>
        </div>
      ),
    },
    {
      title: 'Health',
      dataIndex: 'health',
      width: 110,
      render: (health: string) => healthChip(health),
    },
    {
      title: 'Open',
      dataIndex: 'openTasks',
      width: 80,
      align: 'right',
      render: (value: number) => <span className="number-cell">{value}</span>,
    },
    {
      title: 'Overdue',
      dataIndex: 'overdueTasks',
      width: 96,
      align: 'right',
      render: (value: number) => (
        <span className="number-cell" style={value > 0 ? { color: '#dc2626', fontWeight: 600 } : undefined}>
          {value}
        </span>
      ),
    },
  ];

  return (
    <>
      {header}

      <div className="section-stack">
        <Card className="tf-card pulse-card" variant="outlined">
          <div className="pulse-grid">
            <PulseMetric
              label="Active projects"
              value={data.activeProjects}
              foot="In flight"
              icon={<ProjectOutlined />}
            />
            <PulseMetric
              label="People"
              value={data.totalPeople}
              foot="In the directory"
              icon={<TeamOutlined />}
            />
            <PulseMetric
              label="Open tasks"
              value={data.openTasks}
              foot="Unfinished work"
              icon={<CheckSquareOutlined />}
            />
            <PulseMetric
              label="Overdue"
              value={data.overdueTasks}
              foot="Past the due date"
              icon={<ClockCircleOutlined />}
              tone={data.overdueTasks > 0 ? 'danger' : 'success'}
            />
            <PulseMetric
              label="Blocked"
              value={data.blockedTasks}
              foot="Needs unblocking"
              icon={<StopOutlined />}
              tone={data.blockedTasks > 0 ? 'warning' : 'success'}
            />
            <PulseMetric
              label="Approvals"
              value={data.pendingApprovals}
              foot="Waiting on a human"
              icon={<InboxOutlined />}
              tone={data.pendingApprovals > 0 ? 'warning' : 'success'}
            />
          </div>
        </Card>

        {data.overdueTasks > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${data.overdueTasks} task${data.overdueTasks === 1 ? '' : 's'} past due`}
            description="Overdue work is still open. Open the task list to see owners and due dates."
            action={
              <Link to="/tasks?overdue=true">
                <Button size="small">Open tasks</Button>
              </Link>
            }
          />
        )}

        <Panel
          flush
          title="Needs attention"
          action={
            <Link to="/approvals" className="panel-link">
              Open approvals
            </Link>
          }
        >
          <div className="attention-strip">
            <AttentionTile
              to="/projects"
              icon={<WarningOutlined />}
              tone={atRisk.length > 0 ? 'warning' : undefined}
              title={
                atRisk.length > 0
                  ? `${atRisk.length} project${atRisk.length === 1 ? '' : 's'} at risk`
                  : 'Projects at risk'
              }
              description={
                data.activeProjects === 0
                  ? 'No active projects to assess.'
                  : atRisk.length > 0
                    ? projectNames + (atRisk.length > 3 ? ` +${atRisk.length - 3} more` : '')
                    : 'Every active project is reporting on track.'
              }
              count={atRisk.length}
            />
            <AttentionTile
              to="/tasks?overdue=true"
              icon={<ClockCircleOutlined />}
              tone={data.overdueTasks > 0 ? 'danger' : undefined}
              title="Overdue tasks"
              description="Past the due date and still open."
              count={data.overdueTasks}
              countTone={data.overdueTasks > 0 ? '#dc2626' : undefined}
            />
            <AttentionTile
              to="/tasks"
              icon={<StopOutlined />}
              tone={data.blockedTasks > 0 ? 'warning' : undefined}
              title="Blocked work"
              description="Waiting on a dependency or a decision."
              count={data.blockedTasks}
            />
            <AttentionTile
              to="/approvals"
              icon={<InboxOutlined />}
              tone={data.pendingApprovals > 0 ? 'warning' : undefined}
              title="Approvals pending"
              description="Consequential actions never approve themselves."
              count={data.pendingApprovals}
            />
            <AttentionTile
              to="/agents"
              icon={<RobotOutlined />}
              title="Agent runtime"
              description={
                switchLoading
                  ? 'Checking the Switch runtime…'
                  : live
                    ? `${online} of ${total} agents connected to Switch.`
                    : 'Switch is unreachable; agents are waiting.'
              }
              count={switchLoading ? '—' : live ? `${online}/${total}` : '—'}
            />
          </div>
        </Panel>

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={15}>
            <Panel
              flush
              title="Projects at a glance"
              action={
                <Link to="/projects" className="panel-link">
                  All projects <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              }
            >
              <Table
                rowKey="id"
                columns={projectColumns}
                dataSource={data.projects}
                pagination={false}
                size="middle"
                scroll={{ x: 560 }}
                onRow={() => ({
                  onClick: () => navigate('/projects'),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate('/projects');
                    }
                  },
                  className: 'clickable-row',
                  tabIndex: 0,
                })}
                locale={{ emptyText: 'No active projects.' }}
              />
            </Panel>
          </Col>

          <Col xs={24} xl={9}>
            <Panel
              title="Next deadlines"
              action={
                <Link to="/tasks" className="panel-link">
                  All tasks <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              }
            >
              <List
                dataSource={data.upcomingDeadlines.slice(0, 7)}
                split={false}
                locale={{ emptyText: 'Nothing dated in the next 7 days.' }}
                renderItem={(task) => (
                  <List.Item style={{ padding: '10px 0' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="cell-primary" style={{ fontWeight: 500 }}>
                        {task.title}
                      </div>
                      <Space size={6} style={{ marginTop: 4 }}>
                        {statusChip(task.status)}
                        {priorityChip(task.priority)}
                      </Space>
                    </div>
                    <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(task.dueDate)}
                    </span>
                  </List.Item>
                )}
              />
            </Panel>
          </Col>
        </Row>

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={9}>
            <Panel
              className="fill"
              title="Recent decisions"
              action={
                <Link to="/memory" className="panel-link">
                  Memory <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              }
            >
              {data.recentDecisions.length > 0 ? (
                <Timeline
                  items={data.recentDecisions.map((decision) => ({
                    color: '#1677ff',
                    children: (
                      <div>
                        <div className="cell-primary" style={{ fontWeight: 500, lineHeight: 1.45 }}>
                          {decision.title}
                        </div>
                        <div className="cell-secondary" style={{ marginTop: 3 }}>
                          {formatDate(decision.decidedAt)}
                          {decisionByLabel(decision.decidedBy)}
                        </div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  <p className="empty-title">No decisions recorded yet.</p>
                  <p className="empty-hint">Decisions land here when the organization records them in memory.</p>
                </div>
              )}
            </Panel>
          </Col>

          <Col xs={24} xl={15}>
            <Panel
              className="fill"
              title="Agent activity"
              action={
                <Link to="/agents" className="panel-link">
                  Agents <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              }
            >
              {data.agentActivity.length > 0 ? (
                <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                  {data.agentActivity.slice(0, 10).map((activity) => (
                    <div className="activity-row" key={activity.id}>
                      <span className="activity-agent">{activity.agent.replace('agent:', '')}</span>
                      <div className="activity-copy">
                        <span className="activity-action">{activity.action.replace(/_/g, ' ')}</span>
                        <Tooltip title={activity.outputSummary ?? activity.error}>
                          <p className="activity-summary">
                            {summarizeActivity(activity.action, activity.outputSummary, activity.error)}
                          </p>
                        </Tooltip>
                      </div>
                      <div className="activity-side">
                        <span className="cell-secondary">{timeAgo(activity.at)}</span>
                        <Space size={4}>
                          {activity.demo && <Chip tone="neutral">demo</Chip>}
                          {activity.error && <Chip tone="danger">error</Chip>}
                        </Space>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  <p className="empty-title">No agent activity yet.</p>
                  <p className="empty-hint">The agents appear here once they are working in their Switch room.</p>
                </div>
              )}
            </Panel>
          </Col>
        </Row>

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={15}>
            <Panel title="Proactive feed" action={<span className="panel-caption">Delivered by the scheduler</span>}>
              {data.notifications.length > 0 ? (
                <List
                  dataSource={data.notifications.slice(0, 6)}
                  split={false}
                  renderItem={(notification) => (
                    <List.Item style={{ padding: '11px 0' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Space size={6} style={{ marginBottom: 3 }}>
                          <Tag
                            color="blue"
                            variant="filled"
                            style={{ marginInlineEnd: 0, fontSize: 10.5, textTransform: 'uppercase' }}
                          >
                            {notification.kind}
                          </Tag>
                          {notification.demo && <Chip tone="neutral">demo</Chip>}
                        </Space>
                        <div className="cell-primary" style={{ fontWeight: 500, lineHeight: 1.5 }}>
                          {notification.title ?? notification.body}
                        </div>
                        {notification.title && <div className="cell-secondary">{notification.body}</div>}
                      </div>
                      <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                        {timeAgo(notification.at)}
                      </span>
                    </List.Item>
                  )}
                />
              ) : (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  <p className="empty-title">Nothing proactive sent yet.</p>
                  <p className="empty-hint">The scheduler fires at 08:30 in the organization's timezone.</p>
                </div>
              )}
            </Panel>
          </Col>

          <Col xs={24} xl={9}>
            <Panel
              className="fill"
              title="Scheduled messages"
              action={
                <Link to="/scheduled" className="panel-link">
                  View schedule <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              }
            >
              {scheduleError ? (
                <ErrorBox error={scheduleErrorMessage} onRetry={retrySchedule} />
              ) : reminders.isLoading || jobs.isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : scheduledUpcoming.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  <p className="empty-title">Nothing queued.</p>
                  <p className="empty-hint">Reminders and recurring proactive jobs will appear here before they fire.</p>
                </div>
              ) : (
                <List
                  dataSource={scheduledUpcoming}
                  split={false}
                  renderItem={(item, index) => (
                    <List.Item style={{ padding: '9px 0', borderBottom: index === scheduledUpcoming.length - 1 ? 'none' : '1px solid #eef2f7' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="cell-primary" style={{ fontWeight: 500, lineHeight: 1.45 }}>
                          {item.title}
                        </div>
                        <div className="cell-secondary">
                          {item.kind} · {formatDateTime(item.at)}
                        </div>
                      </div>
                      <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                        {timeUntil(item.at)}
                      </span>
                    </List.Item>
                  )}
                />
              )}
            </Panel>
          </Col>
        </Row>
      </div>
    </>
  );
}
