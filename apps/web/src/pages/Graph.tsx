import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, Space, Tag } from 'antd';
import { useEntity } from '../lib/hooks';
import { api } from '../lib/api';
import {
  Chip,
  Drawer,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  Spinner,
  formatDateTime,
} from '../components/ui';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  group: string;
  attributes: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  confidence: number;
}

const GROUP_COLOR: Record<string, string> = {
  org: '#0f172a',
  people: '#1677ff',
  projects: '#13c2c2',
  work: '#faad14',
  knowledge: '#64748b',
  clients: '#722ed1',
};

const GROUP_LABEL: Record<string, string> = {
  org: 'Organization',
  people: 'People',
  projects: 'Projects & goals',
  work: 'Work',
  knowledge: 'Knowledge',
  clients: 'External',
};

/** Deterministic radial layout: org centre, one ring per group. Stable across visits. */
function layout(nodes: GraphNode[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const rings: Record<string, GraphNode[]> = {};

  for (const node of nodes) (rings[node.group] ??= []).push(node);

  const ringOrder = ['org', 'people', 'projects', 'clients', 'work', 'knowledge'];
  const radii: Record<string, number> = {
    org: 0,
    people: Math.min(width, height) * 0.17,
    projects: Math.min(width, height) * 0.3,
    clients: Math.min(width, height) * 0.36,
    work: Math.min(width, height) * 0.42,
    knowledge: Math.min(width, height) * 0.47,
  };

  const positioned: Array<GraphNode & { x: number; y: number }> = [];
  const orgNodes = rings.org ?? [];

  orgNodes.forEach((node, index) => {
    const angle = (index / Math.max(orgNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = orgNodes.length === 1 ? 0 : Math.min(width, height) * 0.075;
    positioned.push({ ...node, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });

  for (const group of ringOrder) {
    if (group === 'org') continue;
    const list = (rings[group] ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
    const radius = radii[group] ?? 100;
    const offset = group === 'work' ? 0.35 : group === 'knowledge' ? 0.7 : 0;

    list.forEach((node, index) => {
      const angle = (index / list.length) * Math.PI * 2 - Math.PI / 2 + offset;
      positioned.push({ ...node, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
  }

  return { positioned, cx, cy };
}

export default function GraphPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['graph'],
    queryFn: () =>
      api<{
        nodes: GraphNode[];
        edges: GraphEdge[];
        peopleWithoutGraphEntry: Array<{ id: string; name: string }>;
      }>('/api/graph'),
  });

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const entity = useEntity(selected?.id ?? null);

  const width = 860;
  const height = 560;
  const { positioned } = useMemo(() => layout(data?.nodes ?? [], width, height), [data]);
  const positionById = useMemo(() => new Map(positioned.map((node) => [node.id, node])), [positioned]);

  const types = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of data?.nodes ?? []) map.set(node.type, (map.get(node.type) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <>
      <PageHeader
        title="Organization graph"
        description="The living map of people, teams, projects, decisions and work. Every edge is a recorded relationship with provenance; click any node to inspect it."
        extra={
          data ? (
            <Space size={6} wrap>
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                {data.nodes.length} {data.nodes.length === 1 ? 'entity' : 'entities'}
              </Tag>
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                {data.edges.length} {data.edges.length === 1 ? 'relationship' : 'relationships'}
              </Tag>
            </Space>
          ) : undefined
        }
      />

      <div className="section-stack">
        <div className="graph-layout">
          <Panel title="Organization map" action={<span className="panel-caption">Select to inspect</span>}>
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 12 }} />
            ) : isError ? (
              <ErrorBox error={error} onRetry={() => refetch()} />
            ) : !data || data.nodes.length === 0 ? (
              <Empty
                title="No entities mapped yet."
                hint="People, projects and decisions appear here once the organization records them in memory."
              />
            ) : (
              <>
                <div className="graph-frame">
                <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Organization relationship graph">
                  <rect x="0" y="0" width={width} height={height} fill="#fbfcfe" rx="10" />
                  {[0.075, 0.17, 0.3, 0.36, 0.42, 0.47].map((ratio, index) => (
                    <circle
                      key={index}
                      cx={width / 2}
                      cy={height / 2}
                      r={Math.min(width, height) * ratio}
                      fill="none"
                      stroke="#e9eef5"
                      strokeDasharray="3 6"
                    />
                  ))}

                  {(data?.edges ?? []).map((edge) => {
                    const from = positionById.get(edge.from);
                    const to = positionById.get(edge.to);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={edge.id}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#d7dfe9"
                        strokeWidth={1.1}
                        strokeOpacity={0.9}
                      />
                    );
                  })}

                  {positioned.map((node) => {
                    const color = GROUP_COLOR[node.group] ?? '#64748b';
                    const isSelected = selected?.id === node.id;
                    const radius =
                      node.type === 'organization'
                        ? 15
                        : node.group === 'org'
                          ? 9
                          : node.type === 'person'
                            ? 10
                            : node.type === 'project'
                              ? 11
                              : 6;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x},${node.y})`}
                        className="graph-node"
                        onClick={() => setSelected(node)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelected(node);
                        }}
                      >
                        <circle
                          r={isSelected ? radius + 4 : radius}
                          fill={color}
                          fillOpacity={isSelected ? 1 : 0.92}
                          stroke={isSelected ? '#0f172a' : '#fff'}
                          strokeWidth={isSelected ? 2 : 1.5}
                        />
                        <text
                          y={radius + 11}
                          textAnchor="middle"
                          fontSize={node.type === 'task' ? 7 : 9}
                          fill={isSelected ? '#0f172a' : '#475569'}
                          fontWeight={node.group === 'org' || isSelected ? 600 : 500}
                        >
                          {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                </div>
                <div className="graph-mobile-list">
                  {data.nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      className="graph-mobile-item"
                      onClick={() => setSelected(node)}
                    >
                      <span
                        className="legend-dot"
                        style={{ background: GROUP_COLOR[node.group] ?? '#64748b' }}
                      />
                      <span className="graph-mobile-label">{node.label}</span>
                      <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                        {node.type}
                      </Tag>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <div className="section-stack" style={{ gap: 20 }}>
            <Panel title="Legend">
              <div className="legend-list">
                {Object.entries(GROUP_COLOR).map(([key, color]) => (
                  <div className="legend-item" key={key}>
                    <span className="legend-dot" style={{ background: color }} />
                    {GROUP_LABEL[key] ?? key}
                  </div>
                ))}
              </div>
              <div className="soft-divider" />
              <span className="section-label">Entity counts</span>
              <Space size={5} wrap>
                {types.map(([type, count]) => (
                  <Chip key={type} tone="neutral">
                    {type} · {count}
                  </Chip>
                ))}
              </Space>
            </Panel>

            <Panel title="How to read this">
              <p className="page-description" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
                Every line is a recorded relationship — works on, depends on, owns, member of — with provenance. Nodes and
                edges update as the TEAMFORGE agents write to organizational memory. Superseded facts stay in history;
                they are never deleted.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      {selected && (
        <Drawer
          title={
            <Space size={8}>
              <span>{selected.label}</span>
              <Chip tone="neutral">{selected.type}</Chip>
            </Space>
          }
          onClose={() => setSelected(null)}
          width={460}
        >
          {entity.isLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : entity.isError ? (
            <ErrorBox error={entity.error} onRetry={() => entity.refetch()} />
          ) : entity.data ? (
            <div className="section-stack" style={{ gap: 20 }}>
              <div className="cell-secondary">
                Last updated {formatDateTime((entity.data as { updatedAt?: string }).updatedAt)}
              </div>

              <section>
                <span className="section-label">Facts on record</span>
                {(entity.data.facts ?? []).length > 0 ? (
                  (entity.data.facts ?? []).map((fact) => (
                    <div className="fact-row" key={fact._id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="fact-predicate">{fact.predicate.replace(/_/g, ' ')}</span>
                        <span className="cell-secondary">{Math.round((fact.confidence ?? 0) * 100)}% confidence</span>
                      </div>
                      <div className="fact-value">{fact.valueText}</div>
                      <div className="fact-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Chip tone={fact.status === 'disputed' ? 'danger' : fact.status === 'active' ? 'ok' : 'neutral'}>
                          {fact.status}
                        </Chip>
                        {fact.validFrom && <span>valid from {formatDateTime(fact.validFrom)}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No facts yet — interact in a room or add one from Memory.
                  </p>
                )}
              </section>

              {Object.keys(selected.attributes ?? {}).length > 0 && (
                <section>
                  <span className="section-label">Attributes</span>
                  <pre className="code-block">{JSON.stringify(selected.attributes, null, 2)}</pre>
                </section>
              )}
            </div>
          ) : (
            <Spinner />
          )}
        </Drawer>
      )}
    </>
  );
}
