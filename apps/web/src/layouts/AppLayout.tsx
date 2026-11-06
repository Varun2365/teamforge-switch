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
  const siderRef = useRef<HTMLElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const navWasOpen = useRef(false);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );

  const { data: switchStatus, isLoading: switchLoading } = useSwitchStatus();
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
    const media = window.matchMedia('(max-width: 1023px)');
    const onChange = () => {
      setIsMobile(media.matches);
      if (!media.matches) setNavOpen(false);
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

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

  useEffect(() => {
    if (!isMobile) return;

    if (navOpen) {
      navWasOpen.current = true;
      const node = siderRef.current;
      node?.querySelector<HTMLElement>('.ant-menu-item-selected, .ant-menu-item')?.focus();

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setNavOpen(false);
          return;
        }
        if (event.key !== 'Tab' || !node) return;

        const focusable = Array.from(
          node.querySelectorAll<HTMLElement>('.ant-menu-item, a[href], button:not([disabled])'),
        ).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const activeInside = node.contains(document.activeElement);

        if (event.shiftKey && (!activeInside || document.activeElement === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!activeInside || document.activeElement === last)) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }

    if (navWasOpen.current) {
      navToggleRef.current?.focus();
      navWasOpen.current = false;
    }
  }, [isMobile, navOpen]);

  const breadcrumbItems =
    pathname === '/'
      ? [{ title: 'Overview' }]
      : [{ title: <Link to="/">Ops desk</Link> }, { title: current?.label ?? 'Dashboard' }];

  return (
    <Layout className="app-shell">
      {navOpen && <div className="app-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside
        id="app-sider"
        ref={siderRef}
        className={`app-sider${navOpen ? ' is-open' : ''}`}
        aria-label="Primary navigation"
        aria-hidden={isMobile && !navOpen ? true : undefined}
      >
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
          <Button
            className="sider-close"
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          />
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

        <div className="sider-foot" aria-live="polite">
          <div className="sider-foot-row">
            <span className={`live-dot${switchLoading ? ' is-pending' : live ? '' : ' is-off'}`} />
            <span>{switchLoading ? 'Checking Switch…' : live ? 'Switch live' : 'Switch unreachable'}</span>
          </div>
          <div className="sider-foot-meta">
            {switchLoading
              ? 'Contacting the local server'
              : live
                ? `${online}/${total} agents · ${runtime?.roomName ?? 'room pending'}`
                : 'Waiting for the local server'}
          </div>
          <div className="sider-foot-note">No @mention needed — just say it in the room.</div>
        </div>
      </aside>

      <Layout className="app-stage">
        <Header className="app-header">
          <div className="header-left">
            <Button
              ref={navToggleRef}
              className="nav-toggle"
              type="text"
              icon={navOpen ? <CloseOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setNavOpen((open) => !open)}
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={navOpen}
              aria-controls="app-sider"
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
