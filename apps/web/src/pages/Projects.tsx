import { useState } from 'react';
import { Calendar, Flag, ChevronRight, Users } from 'lucide-react';
import { useProjects, useProject } from '../lib/hooks';
import { Panel, Chip, Drawer, Spinner, ErrorBox, Empty, healthChip, statusChip, formatDate } from '../components/ui';

export default function ProjectsPage() {
  const { data: projects, isLoading, isError, error, refetch } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useProject(selectedId ?? '');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">Projects</h1>
        <p className="text-[12px] text-[var(--color-ink-2)]">Health computed from real task data — overdue, blocked and ownership, never vibes.</p>
      </header>

      {isLoading ? <Spinner /> : isError ? <ErrorBox error={error} onRetry={() => refetch()} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {(projects ?? []).map((p) => (
            <button key={p.id} onClick={() => setSelectedId(p.id)} className="panel panel-pad text-left transition hover:border-[var(--color-accent)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-bold">{p.name}</h2>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-ink-2)]">{p.description}</p>
                </div>
                {healthChip(p.health)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-ink-3)]">
                <span className="flex items-center gap-1"><Flag size={10} />{p.category}</span>
                <span className="flex items-center gap-1"><Calendar size={10} />due {formatDate(p.dueDate)}</span>
                {statusChip(p.status)}
              </div>
            </button>
          ))}
          {(projects ?? []).length === 0 && <Empty title="No projects yet." hint="Say 'we're launching X by Y' in a room — TEAMFORGE will track it here." />}
        </div>
      )}

      {selectedId && (
        <Drawer title={detail.data?.name ?? 'Project'} onClose={() => setSelectedId(null)} width={520}>
          {detail.isLoading ? <Spinner /> : detail.isError ? <ErrorBox error={detail.error} /> : detail.data ? (
            <div className="space-y-5">
              <div>
                {healthChip(detail.data.health)}
                <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-2)]">{detail.data.description}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-ink-3)]">
                  <span>Owner: {detail.data.owner?.name ?? 'unassigned'}</span>
                  <span>·</span>
                  <span>Due {formatDate(detail.data.dueDate)}</span>
                  <span>·</span>
                  <span>{detail.data.stats?.doneTasks ?? 0}/{detail.data.stats?.totalTasks ?? 0} tasks done</span>
                </div>
              </div>

              <section>
                <h3 className="stat-label mb-1.5">Task load</h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[['Open', detail.data.stats?.openTasks ?? 0], ['Done', detail.data.stats?.doneTasks ?? 0], ['Overdue', detail.data.stats?.overdueTasks ?? 0], ['Blocked', detail.data.stats?.blockedTasks ?? 0]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg bg-[var(--color-paper)] px-2 py-2">
                      <div className="text-[16px] font-bold">{v}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--color-ink-3)]">{l}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="stat-label mb-1.5">Milestones</h3>
                <ul className="space-y-1.5">
                  {(detail.data.milestones ?? []).map((m) => (
                    <li key={m._id} className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium">{m.name}</span>
                      <span className="flex items-center gap-2">{statusChip(m.status)}<span className="font-mono text-[9px] text-[var(--color-ink-3)]">{formatDate(m.dueDate)}</span></span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="stat-label mb-1.5">Members</h3>
                <ul className="space-y-1.5">
                  {(detail.data.members ?? []).map((m) => (
                    <li key={m.userId} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5"><Users size={11} className="text-[var(--color-ink-3)]" />{m.name}</span>
                      <Chip tone={m.role === 'lead' ? 'accent' : 'neutral'}>{m.role}</Chip>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </Drawer>
      )}
    </div>
  );
}
