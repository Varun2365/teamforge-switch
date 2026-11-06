import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Panel, Spinner, ErrorBox, Drawer, Chip, formatDateTime } from '../components/ui';
import { useEntity, useMemorySearch } from '../lib/hooks';

interface GNode { id: string; label: string; type: string; group: string; attributes: Record<string, unknown> }
interface GEdge { id: string; from: string; to: string; label: string; confidence: number }

const GROUP_COLOR: Record<string, string> = {
  org: '#8a6d3b',
  people: '#0f5c46',
  projects: '#1d4ed8',
  work: '#b45309',
  knowledge: '#57554f',
  clients: '#6d28d9',
};
const GROUP_LABEL: Record<string, string> = { org: 'Org structure', people: 'People', projects: 'Projects & goals', work: 'Work', knowledge: 'Knowledge', clients: 'External' };

/** Deterministic radial layout: org center, ring per group. No physics, no jitter — stable across visits. */
function layout(nodes: GNode[], width: number, height: number) {
  const cx = width / 2, cy = height / 2;
  const rings: Record<string, GNode[]> = {};
  for (const n of nodes) (rings[n.group] ??= []).push(n);
  const ringOrder = ['org', 'people', 'projects', 'clients', 'work', 'knowledge'];
  const radii: Record<string, number> = { org: 0, people: Math.min(width, height) * 0.17, projects: Math.min(width, height) * 0.30, clients: Math.min(width, height) * 0.36, work: Math.min(width, height) * 0.42, knowledge: Math.min(width, height) * 0.47 };
  const positioned: Array<GNode & { x: number; y: number }> = [];
  // org group collapses into a cluster near center
  const orgNodes = rings['org'] ?? [];
  orgNodes.forEach((n, i) => {
    const angle = (i / Math.max(orgNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = orgNodes.length === 1 ? 0 : Math.min(width, height) * 0.075;
    positioned.push({ ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });
  for (const group of ringOrder) {
    if (group === 'org') continue;
    const list = (rings[group] ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
    const r = radii[group] ?? 100;
    const offset = group === 'work' ? 0.35 : group === 'knowledge' ? 0.7 : 0;
    list.forEach((n, i) => {
      const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2 + offset;
      positioned.push({ ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    });
  }
  return { positioned, cx, cy };
}

export default function GraphPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['graph'], queryFn: () => api<{ nodes: GNode[]; edges: GEdge[]; peopleWithoutGraphEntry: Array<{ id: string; name: string }> }>('/api/graph') });
  const [selected, setSelected] = useState<GNode | null>(null);
  const entity = useEntity(selected?.id ?? null);

  const W = 860, H = 560;
  const { positioned } = useMemo(() => layout(data?.nodes ?? [], W, H), [data]);
  const posById = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data?.nodes ?? []) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">Organization Graph</h1>
        <p className="text-[12px] text-[var(--color-ink-2)]">The living map of people, teams, projects, decisions and work — every edge traced to a source. Click any node to inspect it.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        <Panel className="xl:col-span-3 overflow-hidden">
          {isLoading ? <Spinner /> : isError ? <ErrorBox error={error} onRetry={() => refetch()} /> : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="Organization graph">
              <rect x="0" y="0" width={W} height={H} fill="#fbfaf7" rx="12" />
              {[0.075, 0.17, 0.30, 0.36, 0.42, 0.47].map((r, i) => (
                <circle key={i} cx={W / 2} cy={H / 2} r={Math.min(W, H) * r} fill="none" stroke="#eceae4" strokeDasharray="3 6" />
              ))}
              {(data?.edges ?? []).map((e) => {
                const a = posById.get(e.from), b = posById.get(e.to);
                if (!a || !b) return null;
                return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d8d5cf" strokeWidth={1.2} strokeOpacity={0.85} />;
              })}
              {positioned.map((n) => {
                const color = GROUP_COLOR[n.group] ?? '#57554f';
                const isSel = selected?.id === n.id;
                const r = n.type === 'organization' ? 15 : n.group === 'org' ? 9 : n.type === 'person' ? 10 : n.type === 'project' ? 11 : 6;
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" onClick={() => setSelected(n)}>
                    <circle r={isSel ? r + 4 : r} fill={color} fillOpacity={isSel ? 1 : 0.9} stroke={isSel ? '#171612' : '#fff'} strokeWidth={isSel ? 2 : 1.5} />
                    <text y={r + 11} textAnchor="middle" fontSize={n.type === 'task' ? 7 : 9} fill="#3a3935" fontWeight={n.group === 'org' ? 700 : 500}>
                      {n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Legend">
            <ul className="space-y-1.5 text-[11px]">
              {Object.entries(GROUP_COLOR).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v }} />{GROUP_LABEL[k] ?? k}</li>
              ))}
            </ul>
            <div className="mt-3 border-t border-[var(--color-line)] pt-3">
              <h3 className="stat-label mb-1.5">Entity counts</h3>
              <div className="flex flex-wrap gap-1.5">{types.map(([t, n]) => <Chip key={t} tone="neutral">{t} · {n}</Chip>)}</div>
            </div>
          </Panel>
          <Panel title="How to read this">
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-2)]">Every line is a recorded relationship (WORKS_ON, DEPENDS_ON, OWNS, MEMBER_OF…) with provenance. Edges and nodes update as TEAMFORGE's agents write to organizational memory. Superseded facts stay in history — they're never deleted.</p>
          </Panel>
        </div>
      </div>

      {selected && (
        <Drawer title={<span>{selected.label} <Chip tone="neutral">{selected.type}</Chip></span>} onClose={() => setSelected(null)} width={440}>
          {entity.isLoading ? <Spinner /> : entity.isError ? <ErrorBox error={entity.error} /> : entity.data ? (
            <div className="space-y-4">
              <div className="text-[11px] text-[var(--color-ink-3)]">Last updated {formatDateTime((entity.data as { updatedAt?: string }).updatedAt)}</div>
              <section>
                <h3 className="stat-label mb-1.5">Facts on record</h3>
                <ul className="space-y-1.5">
                  {(entity.data.facts ?? []).map((f) => (
                    <li key={f._id} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11px]">
                      <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{f.predicate.replace(/_/g, ' ')}</span>
                      <p className="font-medium">{f.valueText}</p>
                      <p className="mt-0.5 text-[9px] text-[var(--color-ink-3)]">confidence {Math.round((f.confidence ?? 0) * 100)}% · {f.status}</p>
                    </li>
                  ))}
                  {(entity.data.facts?.length ?? 0) === 0 && <p className="text-xs text-[var(--color-ink-3)]">No facts yet — interact in a room or add one from Memory.</p>}
                </ul>
              </section>
              {Object.keys(selected.attributes ?? {}).length > 0 && (
                <section>
                  <h3 className="stat-label mb-1.5">Attributes</h3>
                  <pre className="scroll-thin max-h-40 overflow-auto rounded-md bg-[var(--color-paper)] p-2 text-[10px] font-mono text-[var(--color-ink-2)]">{JSON.stringify(selected.attributes, null, 2)}</pre>
                </section>
              )}
            </div>
          ) : null}
        </Drawer>
      )}
    </div>
  );
}
