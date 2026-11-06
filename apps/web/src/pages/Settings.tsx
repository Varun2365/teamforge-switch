import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Col, Descriptions, Input, Row, Skeleton, Space, Tag } from 'antd';
import { CheckCircleOutlined, KeyOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api, getApiKey, setApiKey } from '../lib/api';
import { useSwitchStatus } from '../lib/hooks';
import { Chip, ErrorBox, PageHeader, Panel } from '../components/ui';

export default function SettingsPage() {
  const [key, setKey] = useState('');
  const { message } = App.useApp();
  const org = useQuery({
    queryKey: ['org-current'],
    queryFn: () => api<Record<string, unknown>>('/api/organizations/current'),
  });
  const sw = useSwitchStatus();

  useEffect(() => {
    setKey(getApiKey());
  }, []);

  const live = sw.data?.server === 'reachable';
  const quietHours = org.data?.quietHours as { start?: string; end?: string } | undefined;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Organization configuration, the Switch connection, and the API key this dashboard uses."
      />

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Panel title="Organization" className="fill">
            {org.isLoading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : org.isError ? (
              <ErrorBox error={org.error} onRetry={() => org.refetch()} />
            ) : org.data ? (
              <Descriptions
                column={1}
                size="small"
                colon={false}
                labelStyle={{ width: 150, color: '#8a97a8' }}
                items={[
                  { key: 'name', label: 'Name', children: <span style={{ fontWeight: 600 }}>{String(org.data.name)}</span> },
                  { key: 'slug', label: 'Slug', children: <span className="mono">{String(org.data.slug)}</span> },
                  { key: 'timezone', label: 'Timezone', children: String(org.data.timezone ?? '—') },
                  {
                    key: 'quiet',
                    label: 'Quiet hours',
                    children: `${quietHours?.start ?? '—'} → ${quietHours?.end ?? '—'}`,
                  },
                  {
                    key: 'cap',
                    label: 'Proactive cap',
                    children: `${String(org.data.maxProactivePerDay ?? '—')} / day / person`,
                  },
                ]}
              />
            ) : (
              <Alert type="warning" showIcon message="Couldn't load the organization profile." description="Is the API running on :4100?" />
            )}
          </Panel>
        </Col>

        <Col xs={24} lg={12}>
          <Panel title="Switch connection" className="fill">
            <Descriptions
              column={1}
              size="small"
              colon={false}
              labelStyle={{ width: 160, color: '#8a97a8' }}
              items={[
                {
                  key: 'status',
                  label: 'Status',
                  children: sw.data?.live ? (
                    <Chip tone="ok">Live</Chip>
                  ) : live ? (
                    <Chip tone="warn">Reachable · runtime offline</Chip>
                  ) : (
                    <Chip tone="warn">Unreachable</Chip>
                  ),
                },
                {
                  key: 'agents',
                  label: 'Agents online',
                  children: sw.data?.runtime ? `${sw.data.runtime.onlineAgents}/${sw.data.runtime.agents.length}` : '—',
                },
                {
                  key: 'server',
                  label: 'Server',
                  children: <span className="mono" style={{ fontSize: 11.5 }}>{sw.data?.serverUrl ?? '—'}</span>,
                },
                {
                  key: 'room',
                  label: 'Room',
                  children: (
                    <span>
                      <span className="mono" style={{ fontSize: 11.5 }}>{sw.data?.runtime?.roomName ?? '—'}</span>
                      <br />
                      <span className="cell-secondary mono">{sw.data?.runtime?.roomId ?? 'not provisioned'}</span>
                    </span>
                  ),
                },
                {
                  key: 'bridge',
                  label: 'Proactive bridge',
                  children: sw.data?.proactiveBridgeConfigured ? (
                    <Chip tone="ok">Configured</Chip>
                  ) : (
                    <Chip tone="neutral">Dashboard only</Chip>
                  ),
                },
              ]}
            />

            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 8,
                background: '#f8fafc',
                fontSize: 11.5,
                lineHeight: 1.6,
                color: '#475569',
              }}
            >
              The six agents register with Switch on boot (<span className="mono">SWITCH_REGISTRATION_TOKEN</span>),
              connect always-on, and provision the room on the Discord bridge automatically. People talk in the room
              with one voice: <span className="mono">@operations-manager</span> — or no mention at all.
            </div>
          </Panel>
        </Col>

        <Col xs={24}>
          <Panel
            title="Dashboard API key"
            action={<span className="panel-caption">Stored in this browser only</span>}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 360px', minWidth: 260 }}>
                <p className="cell-secondary" style={{ marginTop: 0, marginBottom: 8, lineHeight: 1.6 }}>
                  This dashboard authenticates with the same <span className="mono">TEAMFORGE_API_KEY</span> the API
                  enforces. In local development it is injected automatically; paste a different key here to override.
                </p>
                <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
                  <Input.Password
                    prefix={<KeyOutlined style={{ color: '#8a97a8' }} />}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="Paste TEAMFORGE_API_KEY…"
                    autoComplete="off"
                  />
                  <Button
                    type="primary"
                    onClick={() => {
                      setApiKey(key);
                      message.success('API key saved for this browser.');
                    }}
                  >
                    Save key
                  </Button>
                </Space.Compact>
                <div className="cell-secondary" style={{ marginTop: 7 }}>
                  <LockOutlined style={{ marginInlineEnd: 4 }} />
                  Never sent anywhere but this API.
                </div>
              </div>
            </div>
          </Panel>
        </Col>

        <Col xs={24}>
          <Panel title="Roles & permissions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                  <span className="cell-primary" style={{ fontWeight: 600 }}>Enforced today</span>
                </div>
                <Space direction="vertical" size={6}>
                  {[
                    'Organization scoping on every query',
                    'Human approval for assignments and deadline moves',
                    'Human approval for external sends and memory merges',
                    'Temporal facts with provenance and supersession',
                  ].map((item) => (
                    <span key={item} style={{ fontSize: 12, color: '#475569' }}>
                      <CheckCircleOutlined style={{ color: '#16a34a', marginInlineEnd: 7 }} />
                      {item}
                    </span>
                  ))}
                </Space>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <LockOutlined style={{ color: '#8a97a8' }} />
                  <span className="cell-primary" style={{ fontWeight: 600 }}>Later milestone</span>
                </div>
                <p className="cell-secondary" style={{ margin: 0, lineHeight: 1.65 }}>
                  Per-user login with scoped roles is planned for Phase 8. Today, humans with the API key act as the
                  organization owner scope.
                </p>
                <Tag variant="filled" style={{ marginTop: 8, marginInlineEnd: 0 }}>
                  See PHASES.md · Phase 8
                </Tag>
              </div>
            </div>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
