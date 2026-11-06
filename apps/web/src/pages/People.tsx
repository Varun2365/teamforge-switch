import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Input, List, Skeleton, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EnvironmentOutlined,
  MailOutlined,
  RightOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { usePeople, usePerson } from '../lib/hooks';
import type { Person } from '../lib/api';
import {
  Drawer,
  ErrorBox,
  PageHeader,
  Panel,
  Spinner,
  formatDate,
  initials,
  statusChip,
} from '../components/ui';

export default function PeoplePage() {
  const [query, setQuery] = useState('');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const people = usePeople(query || undefined);
  const person = usePerson(id ?? '');

  const columns: ColumnsType<Person> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, record) => (
        <div className="name-cell">
          <Avatar size={30} style={{ background: '#eef5ff', color: '#1677ff', fontSize: 11, fontWeight: 600 }}>
            {initials(name)}
          </Avatar>
          <div className="name-cell-copy">
            <div className="cell-primary">{name}</div>
            {record.email && <div className="cell-secondary">{record.email}</div>}
          </div>
        </div>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      render: (title: string | null) => <span style={{ color: '#475569' }}>{title ?? '—'}</span>,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      render: (department: string | null) => <span style={{ color: '#475569' }}>{department ?? '—'}</span>,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 110,
      render: (role: string) => (
        <Tag color={role === 'owner' ? 'blue' : 'default'} variant="filled" style={{ marginInlineEnd: 0 }}>
          {role}
        </Tag>
      ),
    },
    {
      title: 'Active work',
      dataIndex: 'activeAssignments',
      width: 110,
      align: 'right',
      render: (value: number) => <span className="number-cell">{value}</span>,
    },
    {
      title: '',
      width: 40,
      render: () => <RightOutlined style={{ fontSize: 10, color: '#64748b' }} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="People"
        description="The directory behind the work: roles, departments, skills and current load, sourced from organizational memory."
        extra={
          <Space size={10}>
            <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
              <TeamOutlined style={{ marginInlineEnd: 5 }} />
              {people.data?.length ?? 0} {people.data?.length === 1 ? 'person' : 'people'}
            </Tag>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#64748b' }} />}
              placeholder="Search people, titles…"
              aria-label="Search people"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ width: 280 }}
              autoFocus
            />
          </Space>
        }
      />

      {people.isError ? (
        <ErrorBox error={people.error} onRetry={() => people.refetch()} />
      ) : (
        <Panel flush>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={people.data ?? []}
            loading={people.isLoading}
            pagination={{ pageSize: 14, hideOnSinglePage: true, showSizeChanger: false }}
            scroll={{ x: 760 }}
            onRow={(record) => ({
              onClick: () => navigate(`/people/${record.id}`),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/people/${record.id}`);
                }
              },
              className: 'clickable-row',
              tabIndex: 0,
            })}
            locale={{ emptyText: 'No people match that search.' }}
          />
        </Panel>
      )}

      {id && (
        <Drawer title="Person profile" onClose={() => navigate('/people')} width={500}>
          {person.isLoading ? (
            <Skeleton active avatar paragraph={{ rows: 7 }} />
          ) : person.isError ? (
            <ErrorBox error={person.error} onRetry={() => person.refetch()} />
          ) : person.data ? (
            <div className="section-stack" style={{ gap: 22 }}>
              <div className="detail-head">
                <Avatar size={54} style={{ background: '#eef5ff', color: '#1677ff', fontSize: 18, fontWeight: 600 }}>
                  {initials(person.data.name)}
                </Avatar>
                <div className="detail-head-copy">
                  <h2 className="detail-title">{person.data.name}</h2>
                  <div className="detail-subtitle">{person.data.title ?? 'No title recorded'}</div>
                  <div className="detail-meta">
                    {person.data.email && (
                      <span>
                        <MailOutlined />
                        {person.data.email}
                      </span>
                    )}
                    {person.data.location && (
                      <span>
                        <EnvironmentOutlined />
                        {person.data.location}
                      </span>
                    )}
                    {person.data.joinedAt && <span>Joined {formatDate(person.data.joinedAt)}</span>}
                  </div>
                </div>
              </div>

              <Space size={6} wrap>
                <Tag color="blue" variant="filled" style={{ marginInlineEnd: 0 }}>
                  {person.data.role}
                </Tag>
                {person.data.department && (
                  <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                    {person.data.department.name}
                  </Tag>
                )}
                {person.data.reportsTo && (
                  <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                    Reports to {person.data.reportsTo.name}
                  </Tag>
                )}
              </Space>

              <section>
                <span className="section-label">Skills</span>
                {person.data.skills.length > 0 ? (
                  <Space size={6} wrap>
                    {person.data.skills.map((skill) => (
                      <Tag key={skill.name} className="skill-tag" variant="filled">
                        {skill.name}
                        <span className="mono" style={{ marginLeft: 6, color: '#64748b' }}>
                          L{skill.level}
                        </span>
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No skills recorded yet.
                  </p>
                )}
              </section>

              <section>
                <span className="section-label">Workload · {person.data.workload.capacityNote}</span>
                <div className="mini-stats">
                  {[
                    { label: 'Active', value: person.data.workload.activeAssignments, tone: undefined },
                    { label: 'In progress', value: person.data.workload.inProgress, tone: undefined },
                    { label: 'Blocked', value: person.data.workload.blocked, tone: '#d97706' },
                    { label: 'Overdue', value: person.data.workload.overdue, tone: '#dc2626' },
                  ].map((stat) => (
                    <div className="mini-stat" key={stat.label}>
                      <div className="mini-stat-value" style={stat.value > 0 && stat.tone ? { color: stat.tone } : undefined}>
                        {stat.value}
                      </div>
                      <div className="mini-stat-label">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <span className="section-label">Assigned work</span>
                {person.data.workload.tasks.length > 0 ? (
                  <List
                    dataSource={person.data.workload.tasks}
                    split={false}
                    renderItem={(task) => (
                      <List.Item style={{ padding: '9px 0' }}>
                        <span className="cell-primary" style={{ minWidth: 0, flex: 1, fontWeight: 500 }}>
                          {task.title}
                        </span>
                        <Space size={8}>
                          {statusChip(task.status)}
                          <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                            {formatDate(task.dueDate)}
                          </span>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Nothing on their plate.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <Spinner />
          )}
        </Drawer>
      )}
    </>
  );
}
