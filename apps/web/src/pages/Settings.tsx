import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getApiKey, setApiKey } from '../lib/api';
import { useSwitchStatus } from '../lib/hooks';
import { Panel, Chip, Input, Button } from '../components/ui';

export default function SettingsPage() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const org = useQuery({ queryKey: ['org-current'], queryFn: () => api<Record<string, unknown>>('/api/organizations/current') });
  const sw = useSwitchStatus();

  useEffect(() => { setKey(getApiKey()); }, []);

  const live = sw.data?.server === 'reachable';

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">Settings</h1>
        <p className="text-[12px] text-[var(--color-ink-2)]">Organization configuration, connections and the API key this dashboard uses.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Organization">
          {org.isLoading ? <p className="text-xs text-[var(--color-ink-3)]">Loading…</p> : org.data ? (
            <dl className="grid grid-cols-2 gap-y-3 text-[12px]">
              <dt className="text-[var(--color-ink-3)]">Name</dt><dd className="font-semibold">{String(org.data.name)}</dd>
              <dt className="text-[var(--color-ink-3)]">Slug</dt><dd className="font-mono">{String(org.data.slug)}</dd>
              <dt className="text-[var(--color-ink-3)]">Timezone</dt><dd>{String(org.data.timezone ?? '—')}</dd>
              <dt className="text-[var(--color-ink-3)]">Quiet hours</dt><dd>{String((org.data.quietHours as { start?: string })?.start ?? '—')} → {String((org.data.quietHours as { end?: string })?.end ?? '—')}</dd>
              <dt className="text-[var(--color-ink-3)]">Proactive cap</dt><dd>{String(org.data.maxProactivePerDay ?? '—')} / day / person</dd>
            </dl>
          ) : <p className="text-xs text-[var(--color-danger)]">Couldn't load the org profile. Is the API running on :4100?</p>}
        </Panel>

        <Panel title="Switch connection">
          <dl className="grid grid-cols-2 gap-y-3 text-[12px]">
            <dt className="text-[var(--color-ink-3)]">Status</dt>
            <dd>{sw.data?.live ? <Chip tone="ok">live</Chip> : live ? <Chip tone="warn">reachable · runtime offline</Chip> : <Chip tone="warn">unreachable</Chip>}</dd>
            <dt className="text-[var(--color-ink-3)]">Agents online</dt><dd>{sw.data?.runtime ? `${sw.data.runtime.onlineAgents}/${sw.data.runtime.agents.length}` : '—'}</dd>
            <dt className="text-[var(--color-ink-3)]">Server</dt><dd className="font-mono text-[11px]">{sw.data?.serverUrl ?? '—'}</dd>
            <dt className="text-[var(--color-ink-3)]">Room</dt><dd className="font-mono text-[11px]">{sw.data?.runtime?.roomName ?? '—'}<br />{sw.data?.runtime?.roomId ?? <span className="text-[var(--color-ink-3)]">not provisioned</span>}</dd>
            <dt className="text-[var(--color-ink-3)]">Proactive bridge</dt>
            <dd>{sw.data?.proactiveBridgeConfigured ? <Chip tone="ok">configured</Chip> : <Chip tone="neutral">dashboard-only</Chip>}</dd>
          </dl>
          <div className="mt-4 rounded-lg bg-[var(--color-paper)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
            The six agents register themselves with Switch on boot (<span className="font-mono">SWITCH_REGISTRATION_TOKEN</span>), connect always-on, and provision the room on the Discord bridge automatically. People talk in the room with one voice: <span className="font-mono">@operations-manager</span> — or no mention at all.
          </div>
        </Panel>

        <Panel title="Dashboard API key" className="lg:col-span-2">
          <p className="text-[11px] text-[var(--color-ink-2)]">This dashboard authenticates with the same <code>TEAMFORGE_API_KEY</code> the API enforces. In local dev it's injected automatically; paste a different key here to override.</p>
          <div className="mt-2 flex max-w-md gap-2">
            <Input type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false); }} placeholder="Paste TEAMFORGE_API_KEY…" autoComplete="off" />
            <Button onClick={() => { setApiKey(key); setSaved(true); }}>{saved ? 'Saved ✓' : 'Save'}</Button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--color-ink-3)]">Stored in this browser only (localStorage). Never sent anywhere but this API.</p>
        </Panel>

        <Panel title="Roles & permissions" className="lg:col-span-2">
          <p className="text-[11px] text-[var(--color-ink-2)]">TEAMFORGE enforces organization scoping on every query and approval-gated actions for assignments, deadline moves, external sends and memory merges — always. Humans with the API key act as org owner scope. Per-user login with scoped roles is a later milestone (see PHASES.md Phase 8).</p>
        </Panel>
      </div>
    </div>
  );
}
