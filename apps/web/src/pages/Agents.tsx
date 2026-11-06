import { useState } from 'react';
import { Avatar, Badge, Card, Col, Row, Select, Skeleton, Space, Tag } from 'antd';
import { FilterOutlined, RobotOutlined } from '@ant-design/icons';
import { useAgentActions, useSwitchStatus } from '../lib/hooks';
import {
  Chip,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDateTime,
  timeAgo,
} from '../components/ui';

const AGENTS = [
  { name: 'operations-manager', role: 'AI Operations Manager', color: '#1677ff' },
  { name: 'project-manager', role: 'Project Manager', color: '#13c2c2' },
  { name: 'knowledge-memory', role: 'Knowledge & Memory', color: '#722ed1' },
  { name: 'communication', role: 'Communication & Coordination', color: '#faad14' },
  { name: 'research-strategy', role: 'Research & Strategy', color: '#2f54eb' },
  { name: 'quality-risk', role: 'Quality & Risk', color: '#dc2626' },
];

export default function AgentsPage() {
  const [filter, setFilter] = useState('');
  const actions = useAgentActions(filter || undefined);
  const switchStatus = useSwitchStatus();

  const live = switchStatus.data?.server === 'reachable';
  const runtime = switchStatus.data?.runtime;
  const liveAgents = new Map((runtime?.agents ?? []).map((agent) => [agent.key.replace('agent:', ''), agent]));

  return (
    <>
      <PageHeader
        title="Agents"
        description="Six always-on Switch agents. Unaddressed messages go to the operations manager; specialists join when needed — no @mention required."
        extra={
          <Space size={8}>
            <FilterOutlined style={{ color: '#8a97a8' }} />
            <Select
              value={filter}
              onChange={setFilter}
              style={{ width: 200 }}
              options={[
                { value: '', label: 'All agents' },
                ...AGENTS.map((agent) => ({ value: `agent:${agent.name}`, label: agent.name })),
              ]}
            />
          </Space>
        }
      />

      <div className="section-stack">
        <Card className="tf-card" styles={{ body: { padding: '14px 18px' } }}>
          <div className="runtime-strip">
            <span className={`live-dot${runtime?.running ? '' : ' is-off'}`} />
            <strong style={{ fontSize: 13 }}>Switch runtime</strong>
            <Tag
              color={runtime?.onlineAgents ? 'success' : 'warning'}
              variant="filled"
              style={{ marginInlineEnd: 0 }}
            >
              {runtime ? `${runtime.onlineAgents}/${runtime.agents.length} online` : 'Not reporting'}
            </Tag>
            <span className="cell-secondary">
              Room <span className="mono">{runtime?.roomName ?? 'not provisioned'}</span>
            </span>
            {runtime?.roomId && (
              <span className="cell-secondary">
                · <span className="mono">{runtime.roomId}</span>
              </span>
            )}
            {runtime?.lastError && (
              <Tag color="error" variant="filled" style={{ marginInlineEnd: 0 }}>
                {runtime.lastError}
              </Tag>
            )}
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          {AGENTS.map((agent) => {
            const liveAgent = liveAgents.get(agent.name);
            const connected = liveAgent?.connected ?? false;

            return (
              <Col xs={24} sm={12} xl={8} key={agent.name}>
                <Card className="tf-card agent-card">
                  <div className="agent-card-head">
                    <Avatar
                      shape="square"
                      size={42}
                      icon={<RobotOutlined />}
                      style={{
                        background: `${agent.color}14`,
                        color: agent.color,
                        borderRadius: 10,
                        fontSize: 18,
                      }}
                    />
                    <div className="agent-copy">
                      <div className="agent-name">{liveAgent?.switchName ?? agent.name}</div>
                      <div className="agent-key">{agent.name}</div>
                      <div className="agent-role">{agent.role}</div>
                    </div>
                    <Badge status={connected ? 'success' : live ? 'warning' : 'default'} />
                  </div>

                  <div className="agent-meta">
                    <Badge
                      status={connected ? 'success' : live ? 'warning' : 'default'}
                      text={
                        <span style={{ fontSize: 10.5 }}>
                          {connected ? 'Connected · live' : live ? 'Registered · waiting' : 'Runtime offline'}
                        </span>
                      }
                    />
                    <span>
                      {liveAgent?.rooms?.length ? `${liveAgent.rooms.length} room${liveAgent.rooms.length === 1 ? '' : 's'}` : 'No rooms'}
                    </span>
                    {connected && <Chip tone="ok">live</Chip>}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        <Panel title="Activity log" action={<span className="panel-caption">Auto-refreshes every 10s</span>}>
          {actions.isLoading ? (
            <Skeleton active paragraph={{ rows: 9 }} />
          ) : actions.isError ? (
            <ErrorBox error={actions.error} onRetry={() => actions.refetch()} />
          ) : (actions.data ?? []).length === 0 ? (
            <Empty
              title="No agent activity yet."
              hint="Once the agents are in their rooms, their tool calls and messages land here — live from Switch and the backend."
            />
          ) : (
            <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
              {(actions.data ?? []).map((action) => (
                <div className="activity-row" key={action._id}>
                  <span className="activity-agent">{action.agent.replace('agent:', '')}</span>
                  <div className="activity-copy">
                    <span className="activity-action">{action.action}</span>
                    <p className="activity-summary">{action.outputSummary ?? action.error ?? '—'}</p>
                    {action.roomId && <div className="cell-secondary mono">room {action.roomId}</div>}
                  </div>
                  <div className="activity-side">
                    <span className="cell-secondary" title={formatDateTime(action.at)}>
                      {timeAgo(action.at)}
                    </span>
                    <Space size={4}>
                      {action.demo && <Chip tone="neutral">demo</Chip>}
                      {action.error && <Chip tone="danger">error</Chip>}
                    </Space>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
