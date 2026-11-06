import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, CheckCircle2, ClipboardList, Flame, FolderKanban, Inbox, Siren, Users } from 'lucide-react';
import { useOverview } from '../lib/hooks';
import { Panel, Chip, Spinner, ErrorBox, timeAgo, healthChip, formatDate } from '../components/ui';

function Stat({ label, value, tone = 'ink', icon: Icon }: { label: string; value: number | string; tone?: 'ink' | 'warn' | 'danger' | 'ok'; icon: typeof Flame }) {
  const color = tone === 'danger' ? 'text-[var(--color-danger)]' : tone === 'warn' ? 'text-[var(--color-warn)]' : tone === 'ok' ? 'text-[var(--color-ok)]' : 'text-[var(--color-ink)]';
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <Icon size={14} className="text-[var(--color-ink-3)]" />
      </div>
      <div className={`mt-2 text-[26px] font-bold leading-none tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

export default function OverviewPage() {
  const { data, isLoading, isError, error, refetch } = useOverview();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorBox error={error} onRetry={() => refetch()} />;

  const atRisk = data.projects.filter((p) => p.health !== 'on_track');

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Good to see you.</h1>
          <p className="text-[12px] text-[var(--color-ink-2)]">Here's the state of Acme Technologies — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {atRisk.length > 0 && (
          <Link to="/projects" className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-warn)]">
            <Siren size={13} /> {atRisk.length} project{atRisk.length > 1 ? 's' : ''} need{atRisk.length === 1 ? 's' : ''} attention
          </Link>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active projects" value={data.activeProjects} icon={FolderKanban} />
        <Stat label="People" value={data.totalPeople} icon={Users} />
        <Stat label="Open tasks" value={data.openTasks} icon={ClipboardList} />
        <Stat label="Overdue" value={data.overdueTasks} tone={data.overdueTasks > 0 ? 'danger' : 'ok'} icon={AlertTriangle} />
        <Stat label="Blocked" value={data.blockedTasks} tone={data.blockedTasks > 0 ? 'warn' : 'ok'} icon={Flame} />
        <Stat label="Approvals waiting" value={data.pendingApprovals} tone={data.pendingApprovals > 0 ? 'warn' : 'ok'} icon={Inbox} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Projects at a glance" className="xl:col-span-3" action={<Link to="/projects" className="text-[11px] font-semibold text-[var(--color-accent)]">All projects →</Link>}>
          <div className="space-y-2">
            {data.projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{p.name}</div>
                  <div className="text-[10px] text-[var(--color-ink-3)]">due {formatDate(p.dueDate)} · {p.openTasks} open · {p.overdueTasks} overdue</div>
                </div>
                {healthChip(p.health)}
              </div>
            ))}
            {data.projects.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">No active projects.</p>}
          </div>
        </Panel>

        <Panel title="Next deadlines" className="xl:col-span-2" action={<Link to="/tasks" className="text-[11px] font-semibold text-[var(--color-accent)]">All tasks →</Link>}>
          <ul className="space-y-2">
            {data.upcomingDeadlines.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-3)]">{formatDate(t.dueDate)}</span>
              </li>
            ))}
            {data.upcomingDeadlines.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">Nothing dated in the next 7 days.</p>}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Recent decisions" className="xl:col-span-2" action={<Link to="/memory" className="text-[11px] font-semibold text-[var(--color-accent)]">Memory →</Link>}>
          <ul className="space-y-2">
            {data.recentDecisions.map((d) => (
              <li key={d.id} className="border-l-2 border-[var(--color-accent)] pl-3">
                <p className="text-[12px] font-medium leading-snug">{d.title}</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">{formatDate(d.decidedAt)}{d.decidedBy?.length ? ` · ${d.decidedBy.join(', ')}` : ''}</p>
              </li>
            ))}
            {data.recentDecisions.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">No decisions recorded yet.</p>}
          </ul>
        </Panel>

        <Panel title="Agent activity" className="xl:col-span-3" action={<Link to="/agents" className="text-[11px] font-semibold text-[var(--color-accent)]">Agents →</Link>}>
          <ul className="scroll-thin max-h-[220px] space-y-0 overflow-y-auto">
            {data.agentActivity.map((a) => (
              <li key={a.id} className="flex items-start gap-2 border-b border-[#efede8] py-2 text-[11px] last:border-0">
                <Bot size={12} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] font-semibold text-[var(--color-ink-2)]">{a.agent.replace('agent:', '')}</span>
                  <span className="text-[var(--color-ink-3)]"> · {a.action}</span>
                  <p className="truncate text-[11px] text-[var(--color-ink-2)]">{a.outputSummary ?? a.error ?? ''}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[9px] text-[var(--color-ink-3)]">{timeAgo(a.at)}</span>
                  {a.demo && <Chip tone="neutral">demo</Chip>}
                </div>
              </li>
            ))}
            {data.agentActivity.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">No agent activity yet — the agents are waiting for their rooms.</p>}
          </ul>
        </Panel>
      </div>

      <Panel title="Proactive feed" action={<span className="text-[10px] text-[var(--color-ink-3)]">delivered by TEAMFORGE's scheduler</span>}>
        <ul className="space-y-2">
          {data.notifications.slice(0, 5).map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--color-paper)] px-3 py-2 text-[11px]">
              <div className="min-w-0">
                <span className="font-mono text-[9px] font-semibold uppercase text-[var(--color-ink-3)]">{n.kind}</span>
                <p className="leading-snug text-[var(--color-ink-2)]">{n.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n.demo && <Chip tone="neutral">demo</Chip>}
                <span className="text-[9px] text-[var(--color-ink-3)]">{timeAgo(n.at)}</span>
              </div>
            </li>
          ))}
          {data.notifications.length === 0 && <p className="text-xs text-[var(--color-ink-3)]">Nothing proactive sent yet. The scheduler fires at 08:30 (org timezone).</p>}
        </ul>
      </Panel>

      {data.overdueTasks > 0 && (
        <Link to="/tasks?overdue=true" className="flex items-center gap-2 rounded-xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-4 py-3 text-[12px] font-medium text-[var(--color-danger)]">
          <CheckCircle2 size={14} /> {data.overdueTasks} overdue task{data.overdueTasks > 1 ? 's' : ''} waiting on humans — open tasks →
        </Link>
      )}
    </div>
  );
}
