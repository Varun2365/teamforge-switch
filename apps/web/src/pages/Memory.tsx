import { useEffect, useMemo, useState } from 'react';
import { Search, Brain, Check, X, ShieldQuestion } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMemorySearch, useMemoryProposals, useEntity } from '../lib/hooks';
import { Panel, Chip, Input, Button, Drawer, Spinner, ErrorBox, Empty, formatDate, formatDateTime } from '../components/ui';

export default function MemoryPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ factId: string; current: string } | null>(null);
  const [newValue, setNewValue] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const search = useMemorySearch(debounced);
  const entity = useEntity(selectedEntity);
  const proposals = useMemoryProposals('pending');

  const resolveProposal = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/api/memory/proposals/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
  const correctFact = useMutation({
    mutationFn: ({ factId, value }: { factId: string; value: string }) => api('/api/memory/correct', { method: 'POST', body: JSON.stringify({ factId, newValue: value, note: 'Corrected from dashboard' }) }),
    onSuccess: () => { qc.invalidateQueries(); setCorrecting(null); setNewValue(''); },
  });

  const entities = search.data?.entities ?? [];
  const facts = search.data?.facts ?? [];

  const pendingCount = proposals.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">Organizational Memory</h1>
        <p className="text-[12px] text-[var(--color-ink-2)]">Search what TEAMFORGE knows. Superseded facts are kept — history is never rewritten, only extended.</p>
      </header>

      <div className="relative max-w-2xl">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
        <Input className="h-11 pl-9 text-[14px]" placeholder="Ask the memory — 'pricing decision', 'who owns the API', 'Rahul'…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>

      {pendingCount > 0 && (
        <Panel title={`Memory proposals awaiting a human (${pendingCount})`} action={<Chip tone="warn">needs review</Chip>}>
          <ul className="space-y-2">
            {(proposals.data ?? []).map((p) => (
              <li key={String(p._id)} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{String(p.kind)} · confidence {Math.round(Number(p.confidence ?? 0) * 100)}%</span>
                  <p className="text-[12px] font-medium leading-snug">{String(p.summary)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" className="px-2 py-1" title="Approve" onClick={() => resolveProposal.mutate({ id: String(p._id), approve: true })}><Check size={13} /></Button>
                  <Button variant="ghost" className="px-2 py-1" title="Reject" onClick={() => resolveProposal.mutate({ id: String(p._id), approve: false })}><X size={13} /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {debounced.trim().length >= 2 && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title={`Entities (${entities.length})`} className="lg:col-span-2">
            {search.isLoading ? <Spinner /> : entities.length === 0 ? <Empty title="No entities matched." hint="Try the person, project or decision topic." /> : (
              <ul className="space-y-1.5">
                {entities.map((e, i) => (
                  <li key={e.id ?? i}>
                    <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] px-3 py-2 text-left hover:border-[var(--color-accent)]" onClick={() => setSelectedEntity(e.id)}>
                      <span className="flex items-center gap-2"><Brain size={12} className="text-[var(--color-ink-3)]" /><span className="text-[12px] font-semibold">{e.name}</span></span>
                      <Chip tone="neutral">{e.type}</Chip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Facts mentioning "${debounced}" (${facts.length})`} className="lg:col-span-3">
            {search.isLoading ? <Spinner /> : facts.length === 0 ? <Empty title="No facts matched." /> : (
              <ul className="space-y-1.5">
                {(facts as Array<Record<string, unknown>>).map((f, i) => (
                  <li key={String(f._id ?? i)} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{String(f.predicate ?? '').replace(/_/g, ' ')} · {String(f.status)}</span>
                      <span className="font-mono text-[9px] text-[var(--color-ink-3)]">{formatDate(String(f.recordedAt))}</span>
                    </div>
                    <p className="mt-0.5 font-medium">{String(f.valueText)}</p>
                    {f.status === 'disputed' && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--color-danger)]"><ShieldQuestion size={10} />Disputed — a human must resolve this in Proposals above.</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {debounced.trim().length < 2 && pendingCount === 0 && (
        <Empty title="Type to search memory." hint="Entities are people, teams, projects, decisions, clients — connected by sourced relationships." />
      )}

      {selectedEntity && (
        <Drawer title="Entity" onClose={() => setSelectedEntity(null)} width={460}>
          {entity.isLoading ? <Spinner /> : entity.isError ? <ErrorBox error={entity.error} /> : entity.data ? (
            <div className="space-y-4">
              <div>
                <Chip tone="accent">{entity.data.type}</Chip>
                <h2 className="mt-1.5 text-lg font-bold">{entity.data.name}</h2>
              </div>
              <section>
                <h3 className="stat-label mb-1.5">Facts</h3>
                <ul className="space-y-1.5">
                  {(entity.data.facts ?? []).map((f) => (
                    <li key={f._id} className="rounded-lg border border-[var(--color-line)] px-2.5 py-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{f.predicate.replace(/_/g, ' ')}</span>
                        <button className="text-[9px] font-semibold text-[var(--color-accent)] hover:underline" onClick={() => { setCorrecting({ factId: f._id, current: f.valueText }); setNewValue(f.valueText); }}>correct</button>
                      </div>
                      <p className="mt-0.5 font-medium">{f.valueText}</p>
                      <p className="mt-0.5 text-[9px] text-[var(--color-ink-3)]">{f.status} · {formatDateTime(f.recordedAt)}</p>
                    </li>
                  ))}
                  {(entity.data.facts?.length ?? 0) === 0 && <p className="text-xs text-[var(--color-ink-3)]">No facts on record.</p>}
                </ul>
              </section>
              {correcting && (
                <form className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3" onSubmit={(e) => { e.preventDefault(); correctFact.mutate({ factId: correcting.factId, value: newValue }); }}>
                  <label className="stat-label">Corrected value</label>
                  <Input className="mt-1.5" value={newValue} onChange={(e) => setNewValue(e.target.value)} autoFocus />
                  <div className="mt-2 flex gap-2">
                    <Button type="submit">Save (history kept)</Button>
                    <Button type="button" variant="ghost" onClick={() => setCorrecting(null)}>Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </Drawer>
      )}
    </div>
  );
}
