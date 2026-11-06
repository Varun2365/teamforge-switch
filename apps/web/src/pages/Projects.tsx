import { useState } from 'react';
import { Avatar, Card, Col, List, Progress, Row, Segmented, Skeleton, Space, Tag, Timeline } from 'antd';
import {
  CalendarOutlined,
  FlagOutlined,
  RightOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useProject, useProjects } from '../lib/hooks';
import {
  Drawer,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDate,
  healthChip,
  initials,
  statusChip,
} from '../components/ui';

type ProjectFilter = 'all' | 'at_risk' | 'on_track';

export default function ProjectsPage() {
  const { data: projects, isLoading, isError, error, refetch } = useProjects();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useProject(selectedId ?? '');

  const filtered = (projects ?? []).filter((project) => {
    if (filter === 'all') return true;
    if (filter === 'on_track') return project.health === 'on_track';
    return project.health !== 'on_track';
  });

  const atRiskCount = (projects ?? []).filter((project) => project.health !== 'on_track').length;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Health is computed from real task data — overdue work, blocked work and ownership, never vibes."
        extra={
          <Space size={10} wrap>
            <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
              {projects?.length ?? 0} active
            </Tag>
            {atRiskCount > 0 && (
              <Tag color="warning" variant="filled" style={{ marginInlineEnd: 0 }}>
                {atRiskCount} need attention
              </Tag>
            )}
            <Segmented
              value={filter}
              onChange={(value) => setFilter(value as ProjectFilter)}
              options={[
                { label: 'All', value: 'all' },
                { label: 'At risk', value: 'at_risk' },
                { label: 'On track', value: 'on_track' },
              ]}
            />
          </Space>
        }
      />

      {isLoading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3].map((key) => (
            <Col xs={24} xl={12} key={key}>
              <Card className="tf-card">
                <Skeleton active paragraph={{ rows: 3 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : isError ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <Panel>
          <Empty
            title="No projects in this view."
            hint="Try another filter, or say “we're launching X by Y” in a room and TEAMFORGE will track it here."
          />
        </Panel>
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((project) => {
            const total = project.stats?.totalTasks ?? 0;
            const done = project.stats?.doneTasks ?? 0;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Col xs={24} xl={12} key={project.id}>
                <Card
                  className="tf-card"
                  hoverable
                  role="button"
                  tabIndex={0}
                  aria-label={`Open project ${project.name}`}
                  onClick={() => setSelectedId(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(project.id);
                    }
                  }}
                  styles={{ body: { padding: 20 } }}
                  style={{ height: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 className="detail-title" style={{ fontSize: 15.5 }}>
                        {project.name}
                      </h2>
                      <p
                        className="cell-secondary"
                        style={{
                          margin: '4px 0 0',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.5,
                        }}
                      >
                        {project.description ?? 'No description recorded.'}
                      </p>
                    </div>
                    {healthChip(project.health)}
                  </div>

                  <Space size={6} wrap style={{ marginTop: 12 }}>
                    <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                      <FlagOutlined style={{ marginInlineEnd: 4 }} />
                      {project.category}
                    </Tag>
                    <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                      <CalendarOutlined style={{ marginInlineEnd: 4 }} />
                      {formatDate(project.dueDate)}
                    </Tag>
                    {statusChip(project.status)}
                  </Space>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="cell-secondary">Task progress</span>
                      <span className="cell-secondary">
                        {done}/{total} done
                      </span>
                    </div>
                    <Progress
                      percent={percent}
                      showInfo={false}
                      size="small"
                      strokeColor={project.health === 'on_track' ? '#1677ff' : project.health === 'at_risk' ? '#d97706' : '#dc2626'}
                      trailColor="#eef2f7"
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid #eef2f7',
                      fontSize: 11.5,
                      color: '#64748b',
                    }}
                  >
                    <span>
                      {project.stats?.openTasks ?? 0} open · {project.stats?.overdueTasks ?? 0} overdue ·{' '}
                      {project.stats?.blockedTasks ?? 0} blocked
                    </span>
                    <RightOutlined style={{ fontSize: 10 }} />
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {selectedId && (
        <Drawer title="Project detail" onClose={() => setSelectedId(null)} width={560}>
          {detail.isLoading ? (
            <Skeleton active paragraph={{ rows: 10 }} />
          ) : detail.isError ? (
            <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <div className="section-stack" style={{ gap: 22 }}>
              <div>
                <Space size={8} wrap>
                  {healthChip(detail.data.health)}
                  {statusChip(detail.data.status)}
                  <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                    {detail.data.category}
                  </Tag>
                </Space>
                <h2 className="detail-title" style={{ marginTop: 10 }}>
                  {detail.data.name}
                </h2>
                {detail.data.description && (
                  <p className="detail-subtitle" style={{ marginTop: 6 }}>
                    {detail.data.description}
                  </p>
                )}
                <div className="detail-meta">
                  <span>
                    <UserOutlined />
                    Owner: {detail.data.owner?.name ?? 'Unassigned'}
                  </span>
                  <span>
                    <CalendarOutlined />
                    Due {formatDate(detail.data.dueDate)}
                  </span>
                  <span>
                    <TeamOutlined />
                    {detail.data.members?.length ?? 0} members
                  </span>
                </div>
              </div>

              <section>
                <span className="section-label">Task load</span>
                <div className="mini-stats">
                  {[
                    { label: 'Open', value: detail.data.stats?.openTasks ?? 0, tone: undefined },
                    { label: 'Done', value: detail.data.stats?.doneTasks ?? 0, tone: undefined },
                    { label: 'Overdue', value: detail.data.stats?.overdueTasks ?? 0, tone: '#dc2626' },
                    { label: 'Blocked', value: detail.data.stats?.blockedTasks ?? 0, tone: '#d97706' },
                  ].map((stat) => (
                    <div className="mini-stat" key={stat.label}>
                      <div className="mini-stat-value" style={stat.value > 0 && stat.tone ? { color: stat.tone } : undefined}>
                        {stat.value}
                      </div>
                      <div className="mini-stat-label">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="cell-secondary">Completion</span>
                    <span className="cell-secondary">
                      {detail.data.stats?.doneTasks ?? 0}/{detail.data.stats?.totalTasks ?? 0} tasks
                    </span>
                  </div>
                  <Progress
                    percent={
                      (detail.data.stats?.totalTasks ?? 0) > 0
                        ? Math.round(((detail.data.stats?.doneTasks ?? 0) / (detail.data.stats?.totalTasks ?? 1)) * 100)
                        : 0
                    }
                    showInfo={false}
                    size="small"
                    strokeColor="#1677ff"
                    trailColor="#eef2f7"
                  />
                </div>
              </section>

              <section>
                <span className="section-label">Milestones</span>
                {(detail.data.milestones ?? []).length > 0 ? (
                  <Timeline
                    items={(detail.data.milestones ?? []).map((milestone) => ({
                      color: milestone.status === 'done' ? '#16a34a' : milestone.status === 'blocked' ? '#dc2626' : '#1677ff',
                      children: (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div className="cell-primary" style={{ fontWeight: 500 }}>
                              {milestone.name}
                            </div>
                            <div className="cell-secondary">{formatDate(milestone.dueDate)}</div>
                          </div>
                          {statusChip(milestone.status)}
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No milestones recorded.
                  </p>
                )}
              </section>

              <section>
                <span className="section-label">Members</span>
                {(detail.data.members ?? []).length > 0 ? (
                  <List
                    dataSource={detail.data.members}
                    split={false}
                    renderItem={(member) => (
                      <List.Item style={{ padding: '7px 0' }}>
                        <Space size={9}>
                          <Avatar size={26} style={{ background: '#eef5ff', color: '#1677ff', fontSize: 10, fontWeight: 600 }}>
                            {initials(member.name)}
                          </Avatar>
                          <span className="cell-primary" style={{ fontWeight: 500 }}>
                            {member.name}
                          </span>
                        </Space>
                        <Tag color={member.role === 'lead' ? 'blue' : 'default'} variant="filled" style={{ marginInlineEnd: 0 }}>
                          {member.role}
                        </Tag>
                      </List.Item>
                    )}
                  />
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No members recorded.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </Drawer>
      )}
    </>
  );
}
