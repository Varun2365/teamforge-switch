import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Breadcrumb, Button, Layout, Menu, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  BellOutlined,
  CloseOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { api } from '../lib/api';
import { useApprovalsPending, useSwitchStatus } from '../lib/hooks';
import { NAV_GROUPS, activeNavPath, navEntryForPath } from '../lib/nav';
import { initials } from '../components/ui';
import CommandPalette from '../components/CommandPalette';

const { Header, Content } = Layout;

const menuItems = NAV_GROUPS.map((group) => ({
  key: `group-${group.label}`,
  type: 'group' as const,
  label: group.label,
  children: group.items.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.label,
  })),
})) as MenuProps['items'];

export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: switchStatus } = useSwitchStatus();
  const pending = useApprovalsPending();
  const org = useQuery({
    queryKey: ['org-current'],
    queryFn: () => api<Record<string, unknown>>('/api/organizations/current'),
    staleTime: 60_000,
  });

  const live = switchStatus?.server === 'reachable';
  const runtime = switchStatus?.runtime;
  const online = runtime?.onlineAgents ?? 0;
  const total = runtime?.agents.length ?? 6;
  const pendingCount = pending.data?.length ?? 0;
  const orgName = typeof org.data?.name === 'string' ? org.data.name : 'Workspace';
  const current = navEntryForPath(pathname);
  const selectedKey = activeNavPath(pathname);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setNavOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const breadcrumbItems =
    pathname === '/'
      ? [{ title: 'Overview' }]
      : [{ title: <Link to="/">Ops desk</Link> }, { title: current?.label ?? 'Dashboard' }];

  return (
    <Layout className="app-shell">
      {navOpen && <div className="app-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside className={`app-sider${navOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
        <div className="app-brand">
          <div className="app-brand-mark" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M5 6.5h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M12 6.5V19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="app-brand-name">TEAMFORGE</div>
            <div className="app-brand-sub">Operations desk</div>
          </div>
        </div>

        <Menu
          className="app-nav"
          theme="dark"
          mode="inline"
          items={menuItems}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            navigate(key);
            setNavOpen(false);
          }}
        />

        <div className="sider-foot">
          <div className="sider-foot-row">
            <span className={`live-dot${live ? '' : ' is-off'}`} />
            <span>{live ? 'Switch live' : 'Switch unreachable'}</span>
          </div>
          <div className="sider-foot-meta">
            {live ? `${online}/${total} agents · ${runtime?.roomName ?? 'room pending'}` : 'Waiting for the local server'}
          </div>
          <div className="sider-foot-note">No @mention needed — just say it in the room.</div>
        </div>
      </aside>

      <Layout className="app-stage">
        <Header className="app-header">
          <div className="header-left">
            <Button
              className="nav-toggle"
              type="text"
              icon={navOpen ? <CloseOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setNavOpen((open) => !open)}
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            />
            <div className="header-crumbs">
              <Breadcrumb items={breadcrumbItems} />
            </div>
          </div>

          <div className="header-right">
            <button
              type="button"
              className="command-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search or jump to a page"
            >
              <SearchOutlined style={{ fontSize: 13 }} />
              <span className="trigger-label">Search or jump to…</span>
              <span className="kbd">Ctrl K</span>
            </button>

            <Tooltip title={pendingCount > 0 ? `${pendingCount} approvals waiting` : 'No approvals waiting'}>
              <Link to="/approvals" aria-label="Approvals">
                <Badge count={pendingCount} size="small" offset={[-2, 2]}>
                  <Button type="text" icon={<BellOutlined />} aria-label="Approvals" />
                </Badge>
              </Link>
            </Tooltip>

            <div className="header-divider" />

            <Tooltip title={`${orgName} · organization owner`}>
              <div className="header-user">
                <Avatar
                  size={30}
                  style={{ background: '#eef5ff', color: '#1677ff', fontSize: 11.5, fontWeight: 600 }}
                >
                  {initials(orgName)}
                </Avatar>
                <div className="header-user-meta">
                  <span className="header-user-name">{orgName}</span>
                  <span className="header-user-org">Organization owner</span>
                </div>
              </div>
            </Tooltip>
          </div>
        </Header>

        <Content className="app-scroll" ref={scrollRef}>
          <div className="page-container">
            <Outlet />
          </div>
        </Content>
      </Layout>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </Layout>
  );
}
