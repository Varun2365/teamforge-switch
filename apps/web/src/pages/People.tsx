import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, MapPin, Mail, ChevronRight } from 'lucide-react';
import { usePeople, usePerson } from '../lib/hooks';
import { Panel, Chip, Input, Drawer, Spinner, ErrorBox, Empty, formatDate, statusChip } from '../components/ui';

export default function PeoplePage() {
  const [q, setQ] = useState('');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const people = usePeople(q || undefined);
  const person = usePerson(id ?? '');

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">People</h1>
          <p className="text-[12px] text-[var(--color-ink-2)]">Skills, load and relationships — straight from organizational memory.</p>
        </div>
        <div className="relative w-64">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input className="pl-8" placeholder="Search people, titles…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
      </header>

      <Panel>
        {people.isLoading ? <Spinner /> : people.isError ? <ErrorBox error={people.error} onRetry={() => people.refetch()} /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr><th className="th">Name</th><th className="th">Title</th><th className="th">Department</th><th className="th">Role</th><th className="th">Active</th><th className="th"></th></tr>
              </thead>
              <tbody>
                {(people.data ?? []).map((p) => (
                  <tr key={p.id} className="row-hover cursor-pointer" onClick={() => navigate(`/people/${p.id}`)}>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[10px] font-bold text-[var(--color-accent)]">
                          {p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                        </div>
                        <span className="font-semibold">{p.name}</span>
                      </div>
                    </td>
                    <td className="td text-[var(--color-ink-2)]">{p.title ?? '—'}</td>
                    <td className="td text-[var(--color-ink-2)]">{p.department ?? '—'}</td>
                    <td className="td"><Chip tone={p.role === 'owner' ? 'accent' : 'neutral'}>{p.role}</Chip></td>
                    <td className="td font-mono text-[12px]">{p.activeAssignments}</td>
                    <td className="td text-right"><ChevronRight size={14} className="ml-auto text-[var(--color-ink-3)]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(people.data?.length ?? 0) === 0 && <Empty title="No people match that." hint="Try a shorter search." />}
          </div>
        )}
      </Panel>

      {id && (
        <Drawer title={person.data?.name ?? 'Person'} onClose={() => navigate('/people')} width={480}>
          {person.isLoading ? <Spinner /> : person.isError ? <ErrorBox error={person.error} /> : person.data ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-bold">{person.data.name}</div>
                <div className="text-[12px] text-[var(--color-ink-2)]">{person.data.title}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
                  {person.data.email && <span className="flex items-center gap-1"><Mail size={11} />{person.data.email}</span>}
                  {person.data.location && <span className="flex items-center gap-1"><MapPin size={11} />{person.data.location}</span>}
                  {person.data.joinedAt && <span>Joined {formatDate(person.data.joinedAt)}</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <Chip tone="accent">{person.data.role}</Chip>
                  {person.data.department && <Chip tone="neutral">{person.data.department.name}</Chip>}
                  {person.data.reportsTo && <Chip tone="neutral">Reports to {person.data.reportsTo.name}</Chip>}
                </div>
              </div>

              <section>
                <h3 className="stat-label mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {person.data.skills.map((s) => (
                    <span key={s.name} className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[11px]">
                      {s.name} <span className="font-mono text-[9px] text-[var(--color-ink-3)]">L{s.level}</span>
                    </span>
                  ))}
                  {person.data.skills.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">No skills recorded yet.</p>}
                </div>
              </section>

              <section>
                <h3 className="stat-label mb-2">Workload — {person.data.workload.capacityNote}</h3>
                <div className="mb-2 grid grid-cols-4 gap-2 text-center">
                  {[['Active', person.data.workload.activeAssignments], ['In progress', person.data.workload.inProgress], ['Blocked', person.data.workload.blocked], ['Overdue', person.data.workload.overdue]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg bg-[var(--color-paper)] px-2 py-2">
                      <div className="text-[16px] font-bold">{v}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--color-ink-3)]">{l}</div>
                    </div>
                  ))}
                </div>
                <ul className="space-y-1.5">
                  {person.data.workload.tasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[11px]">
                      <span className="truncate">{t.title}</span>
                      <span className="flex shrink-0 items-center gap-2">{statusChip(t.status)}<span className="font-mono text-[9px] text-[var(--color-ink-3)]">{formatDate(t.dueDate)}</span></span>
                    </li>
                  ))}
                  {person.data.workload.tasks.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">Nothing on their plate.</p>}
                </ul>
              </section>
            </div>
          ) : null}
        </Drawer>
      )}
    </div>
  );
}
