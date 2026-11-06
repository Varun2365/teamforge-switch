import { useState } from 'react';
import { Bot, Wifi, WifiOff, Filter } from 'lucide-react';
import { useAgentActions, useSwitchStatus } from '../lib/hooks';
import { Panel, Chip, Select, Spinner, ErrorBox, Empty, formatDateTime, timeAgo } from '../components/ui';

const AGENTS = [
  { name: 'operations-manager', role: 'AI Operations Manager', color: '#0f5c46' },
  { name: 'project-manager', role: 'Project Manager', color: '#1d4ed8' },
  { name: 'knowledge-memory', role: 'Knowledge & Memory', color: '#6d28d9' },
  { name: 'communication', role: 'Communication & Coordination', color: '#b45309' },
  { name: 'research-strategy', role: 'Research & Strategy', color: '#0e7490' },
  { name: 'quality-risk', role: 'Quality & Risk', color: '#b91c1c' },
];

export default function AgentsPage() {
  const [filter, setFilter] = useState('');
  const actions = useAgentActions(filter || undefined);
  const sw = useSwitchStatus();
  const live = sw.data?.server === 'reachable';
  const runtime = sw.data?.runtime;
  const liveAgents = new Map((runtime?.agents ?? []).map((a) => [a.key.replace('agent:', ''), a]));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Agents</h1>
          <p className="text-[12px] text-[var(--color-ink-2)]">Six always-on Switch agents. Unaddressed messages go to @operations-manager; specialists join when needed — no @mention required.</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-[var(--color-ink-3)]" />
          <Select className="w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All agents</option>
            {AGENTS.map((a) => <option key={a.name} value={`agent:${a.name}`}>{a.name}</option>)}
          </Select>
        </div>
      </header>

      {runtime?.running && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3 text-[11px]">
          <span className={`inline-flex h-2 w-2 rounded-full ${runtime.onlineAgents > 0 ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-warn)]'}`} />
          <span className="font-semibold">Switch runtime</span>
          <Chip tone={runtime.onlineAgents > 0 ? 'ok' : 'warn'}>{runtime.onlineAgents}/{runtime.agents.length} online</Chip>
          <span className="text-[var(--color-ink-3)]">room <span className="font-mono">{runtime.roomName}</span> · <span className="font-mono">{runtime.roomId ?? 'not provisioned'}</span></span>
          {runtime.lastError && <span className="text-[var(--color-danger)]">{runtime.lastError}</span>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => {
          const liveAgent = liveAgents.get(a.name);
          const connected = liveAgent?.connected ?? false;
          return (
            <div key={a.name} className="panel panel-pad flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: a.color }}>
                <Bot size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] font-bold">{liveAgent?.switchName ?? a.name}</div>
                <div className="text-[10px] text-[var(--color-ink-2)]">{a.role}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-[var(--color-ink-3)]">
                  {connected ? <Wifi size={9} className="text-[var(--color-ok)]" /> : <WifiOff size={9} className="text-[var(--color-warn)]" />}
                  {connected ? 'connected · live' : live ? 'registered · waiting' : 'runtime offline'}
                  {liveAgent?.rooms?.length ? <span className="font-mono"> · {liveAgent.rooms.length} room(s)</span> : null}
                </div>
              </div>
              {connected && <Chip tone="ok">live</Chip>}
            </div>
          );
        })}
      </div>

      <Panel title="Activity log" action={<span className="text-[10px] text-[var(--color-ink-3)]">auto-refreshes every 10s</span>}>
        {actions.isLoading ? <Spinner /> : actions.isError ? <ErrorBox error={actions.error} onRetry={() => actions.refetch()} /> : (
          <ul className="scroll-thin max-h-[480px] space-y-0 overflow-y-auto">
            {(actions.data ?? []).map((a) => (
              <li key={a._id} className="flex items-start gap-3 border-b border-[#efede8] py-2.5 last:border-0">
                <span className="mt-0.5 font-mono text-[10px] font-semibold text-[var(--color-ink-2)] w-36 shrink-0 truncate">{a.agent.replace('agent:', '')}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[9px] uppercase text-[var(--color-ink-3)]">{a.action}</span>
                  <p className="text-[11px] leading-snug text-[var(--color-ink-2)]">{a.outputSummary ?? a.error ?? '—'}</p>
                  {a.roomId && <p className="mt-0.5 font-mono text-[9px] text-[var(--color-ink-3)]">room {a.roomId}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[9px] text-[var(--color-ink-3)]" title={formatDateTime(a.at)}>{timeAgo(a.at)}</span>
                  {a.demo && <Chip tone="neutral">demo</Chip>}
                  {a.error && <Chip tone="danger">error</Chip>}
                </div>
              </li>
            ))}
            {(actions.data?.length ?? 0) === 0 && <Empty title="No agent activity yet." hint="Once the agents are in their rooms, their tool calls and messages land here — live from Switch and the backend." />}
          </ul>
        )}
      </Panel>
    </div>
  );
}
