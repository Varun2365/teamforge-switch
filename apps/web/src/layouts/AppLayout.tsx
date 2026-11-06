import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Network, FolderKanban, ListChecks, Brain, CheckSquare, Bot, Settings, Hammer, Wifi, WifiOff } from 'lucide-react';
import { clsx } from '../lib/clsx';
import { useSwitchStatus } from '../lib/hooks';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/graph', icon: Network, label: 'Org Graph' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/tasks', icon: ListChecks, label: 'Tasks' },
  { to: '/memory', icon: Brain, label: 'Memory' },
  { to: '/approvals', icon: CheckSquare, label: 'Approvals' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout() {
  const { data: switchStatus } = useSwitchStatus();
  const live = switchStatus?.server === 'reachable';
  const online = switchStatus?.runtime?.onlineAgents ?? 0;
  const total = switchStatus?.runtime?.agents.length ?? 6;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-[212px] shrink-0 flex-col bg-[#171612] text-[#b9b7b0]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[#eaf5ee]">
            <Hammer size={16} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-[13px] font-bold leading-tight tracking-tight text-[#f2f0ea]">TEAMFORGE</div>
            <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8f8c84]">Ops desk · Acme</div>
          </div>
        </div>
        <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
              <Icon size={15} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-[#8f8c84]">
            {live ? <Wifi size={11} className="text-emerald-400" /> : <WifiOff size={11} className="text-amber-400" />}
            <span className="truncate">{live ? `Switch live · ${online}/${total} agents` : 'Switch not reachable'}</span>
          </div>
          <div className="mt-1 text-[9px] leading-snug text-[#6d6b64]">No @mention needed — just say it in the room.</div>
        </div>
      </aside>

      {/* Main */}
      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-6 py-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
