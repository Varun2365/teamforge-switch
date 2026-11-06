import { useEffect, useState } from 'react';
import { App, Button, Col, Input, List, Row, Skeleton, Space, Tag } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  EditOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEntity, useMemoryProposals, useMemorySearch } from '../lib/hooks';
import {
  Chip,
  Drawer,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDate,
  formatDateTime,
} from '../components/ui';

export default function MemoryPage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ factId: string; current: string } | null>(null);
  const [newValue, setNewValue] = useState('');
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useMemorySearch(debounced);
  const entity = useEntity(selectedEntity);
  const proposals = useMemoryProposals('pending');

  const resolveProposal = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/api/memory/proposals/${id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['memory'] });
      message.success(variables.approve ? 'Proposal approved.' : 'Proposal rejected.');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const correctFact = useMutation({
    mutationFn: ({ factId, value }: { factId: string; value: string }) =>
      api('/api/memory/correct', {
        method: 'POST',
        body: JSON.stringify({ factId, newValue: value, note: 'Corrected from dashboard' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      message.success('Fact corrected. The previous value stays in history.');
      setCorrecting(null);
      setNewValue('');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const entities = search.data?.entities ?? [];
  const facts = search.data?.facts ?? [];
  const pendingCount = proposals.data?.length ?? 0;
  const hasQuery = debounced.trim().length >= 2;

  return (
    <>
      <PageHeader
        title="Organizational memory"
        description="Search what TEAMFORGE knows. Facts are temporal and sourced; superseded values stay in history and are never rewritten."
        extra={
          <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
            <DatabaseOutlined style={{ marginInlineEnd: 5 }} />
            {pendingCount} proposal{pendingCount === 1 ? '' : 's'} pending
          </Tag>
        }
      />

      <div className="section-stack">
        <div>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined style={{ color: '#64748b' }} />}
            placeholder="Ask the memory — a person, project, decision, client or topic…"
            aria-label="Search organizational memory"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ maxWidth: 760 }}
            autoFocus
          />
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#64748b' }}>
            Searches entity names and recorded facts. Try “ownership”, “launch”, “deadline”, or a person's name.
          </div>
        </div>

        {pendingCount > 0 && (
          <Panel
            title="Memory proposals awaiting a human"
            action={<Chip tone="warn">needs review</Chip>}
          >
            {(proposals.data ?? []).map((proposal) => {
              const id = String(proposal._id);
              return (
                <div className="proposal-row" key={id}>
                  <div className="proposal-copy">
                    <div className="proposal-meta">
                      {String(proposal.kind)} · confidence {Math.round(Number(proposal.confidence ?? 0) * 100)}%
                    </div>
                    <div className="proposal-summary">{String(proposal.summary)}</div>
                  </div>
                  <Space size={6} style={{ flex: '0 0 auto' }}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={resolveProposal.isPending && resolveProposal.variables?.id === id && resolveProposal.variables?.approve}
                      onClick={() => resolveProposal.mutate({ id, approve: true })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      loading={resolveProposal.isPending && resolveProposal.variables?.id === id && !resolveProposal.variables?.approve}
                      onClick={() => resolveProposal.mutate({ id, approve: false })}
                    >
                      Reject
                    </Button>
                  </Space>
                </div>
              );
            })}
          </Panel>
        )}

        {hasQuery ? (
          <Row gutter={[20, 20]}>
            <Col xs={24} lg={9}>
              <Panel title={`Entities (${entities.length})`}>
                {search.isLoading ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : entities.length === 0 ? (
                  <Empty title="No entities matched." hint="Try a person, project or decision topic." />
                ) : (
                  <List
                    dataSource={entities}
                    split={false}
                    renderItem={(item, index) => (
                      <div
                        key={item.id ?? index}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEntity(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelectedEntity(item.id);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 0',
                          borderBottom: index === entities.length - 1 ? 'none' : '1px solid #eef2f7',
                          cursor: 'pointer',
                        }}
                      >
                        <Space size={8}>
                          <DatabaseOutlined style={{ color: '#64748b' }} />
                          <span className="cell-primary" style={{ fontWeight: 500 }}>
                            {item.name}
                          </span>
                        </Space>
                        <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                          {item.type}
                        </Tag>
                      </div>
                    )}
                  />
                )}
              </Panel>
            </Col>

            <Col xs={24} lg={15}>
              <Panel title={`Facts mentioning “${debounced}” (${facts.length})`}>
                {search.isLoading ? (
                  <Skeleton active paragraph={{ rows: 8 }} />
                ) : facts.length === 0 ? (
                  <Empty title="No facts matched." hint="Try a broader term or a person's name." />
                ) : (
                  (facts as Array<Record<string, unknown>>).map((fact, index) => (
                    <div className="fact-row" key={String(fact._id ?? index)}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="fact-predicate">{String(fact.predicate ?? '').replace(/_/g, ' ')}</span>
                        <span className="cell-secondary">{formatDate(String(fact.recordedAt))}</span>
                      </div>
                      <div className="fact-value">{String(fact.valueText)}</div>
                      <div className="fact-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Chip tone={fact.status === 'disputed' ? 'danger' : fact.status === 'active' ? 'ok' : 'neutral'}>
                          {String(fact.status)}
                        </Chip>
                        {fact.status === 'disputed' && (
                          <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <WarningOutlined /> Needs a human decision.
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </Panel>
            </Col>
          </Row>
        ) : pendingCount === 0 ? (
          <Panel>
            <Empty
              title="Search organizational memory"
              hint="Entities are people, teams, projects, decisions and clients, connected by sourced relationships. Type at least two characters to begin."
            />
          </Panel>
        ) : null}
      </div>

      {selectedEntity && (
        <Drawer title="Entity" onClose={() => setSelectedEntity(null)} width={480}>
          {entity.isLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : entity.isError ? (
            <ErrorBox error={entity.error} onRetry={() => entity.refetch()} />
          ) : entity.data ? (
            <div className="section-stack" style={{ gap: 20 }}>
              <div>
                <Tag color="blue" variant="filled" style={{ marginInlineEnd: 0 }}>
                  {entity.data.type}
                </Tag>
                <h2 className="detail-title" style={{ marginTop: 9 }}>
                  {entity.data.name}
                </h2>
              </div>

              <section>
                <span className="section-label">Facts</span>
                {(entity.data.facts ?? []).length > 0 ? (
                  (entity.data.facts ?? []).map((fact) => (
                    <div className="fact-row" key={fact._id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="fact-predicate">{fact.predicate.replace(/_/g, ' ')}</span>
                        <Button
                          type="link"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setCorrecting({ factId: fact._id, current: fact.valueText });
                            setNewValue(fact.valueText);
                          }}
                        >
                          Correct
                        </Button>
                      </div>
                      <div className="fact-value">{fact.valueText}</div>
                      <div className="fact-meta">
                        {fact.status} · {formatDateTime(fact.recordedAt)} · confidence{' '}
                        {Math.round((fact.confidence ?? 0) * 100)}%
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="No facts on record." hint="Interaction in a room will add sourced facts here." />
                )}
              </section>

              {correcting && (
                <div
                  style={{
                    padding: 14,
                    border: '1px solid #91caff',
                    borderRadius: 10,
                    background: '#f0f7ff',
                  }}
                >
                  <span className="section-label">Corrected value</span>
                  <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} autoFocus />
                  <Space size={8} style={{ marginTop: 10 }}>
                    <Button
                      type="primary"
                      size="small"
                      loading={correctFact.isPending}
                      onClick={() => {
                        if (newValue.trim()) correctFact.mutate({ factId: correcting.factId, value: newValue.trim() });
                      }}
                    >
                      Save · history kept
                    </Button>
                    <Button size="small" onClick={() => setCorrecting(null)}>
                      Cancel
                    </Button>
                  </Space>
                  <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748b' }}>
                    The previous value is superseded, never deleted.
                  </div>
                </div>
              )}

              {entity.data.attributes && Object.keys(entity.data.attributes).length > 0 && (
                <section>
                  <span className="section-label">Attributes</span>
                  <pre className="code-block">{JSON.stringify(entity.data.attributes, null, 2)}</pre>
                </section>
              )}
            </div>
          ) : null}
        </Drawer>
      )}
    </>
  );
}
