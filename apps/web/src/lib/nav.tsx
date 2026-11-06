import type { ReactNode } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CheckSquareOutlined,
  DatabaseOutlined,
  InboxOutlined,
  PlusOutlined,
  ProjectOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons';

export interface NavEntry {
  path: string;
  label: string;
  description: string;
  icon: ReactNode;
  group?: string;
  keywords: string;
}

export interface NavGroup {
  label: string;
  items: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      {
        path: '/',
        label: 'Overview',
        description: 'Organization pulse, risk and activity',
        icon: <AppstoreOutlined />,
        keywords: 'home dashboard pulse overview',
      },
      {
        path: '/people',
        label: 'People',
        description: 'Directory, skills and workload',
        icon: <TeamOutlined />,
        keywords: 'people team directory skills workload',
      },
      {
        path: '/graph',
        label: 'Org graph',
        description: 'Living map of relationships',
        icon: <ApartmentOutlined />,
        keywords: 'graph relationships map network org',
      },
    ],
  },
  {
    label: 'Delivery',
    items: [
      {
        path: '/projects',
        label: 'Projects',
        description: 'Health, milestones and owners',
        icon: <ProjectOutlined />,
        keywords: 'projects health milestones owners',
      },
      {
        path: '/tasks',
        label: 'Tasks',
        description: 'List and board of all work',
        icon: <CheckSquareOutlined />,
        keywords: 'tasks board list work todo',
      },
      {
        path: '/approvals',
        label: 'Approvals',
        description: 'Decisions waiting on a human',
        icon: <SafetyIcon />,
        keywords: 'approvals pending review decisions',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        path: '/memory',
        label: 'Memory',
        description: 'Search facts, sources and proposals',
        icon: <DatabaseOutlined />,
        keywords: 'memory facts entities search proposals knowledge',
      },
      {
        path: '/agents',
        label: 'Agents',
        description: 'Switch runtime and activity log',
        icon: <RobotOutlined />,
        keywords: 'agents switch runtime activity bots',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        path: '/settings',
        label: 'Settings',
        description: 'Organization, connection and API key',
        icon: <SettingOutlined />,
        keywords: 'settings organization api key connection',
      },
    ],
  },
];

export const NAV_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

export const QUICK_ACTIONS: NavEntry[] = [
  {
    path: '/tasks?new=true',
    label: 'Create a task',
    description: 'Open a new task form',
    icon: <PlusOutlined />,
    group: 'Quick actions',
    keywords: 'new task create add work',
  },
  {
    path: '/tasks?overdue=true',
    label: 'Review overdue work',
    description: 'Every task past its due date',
    icon: <HistoryOutlined />,
    group: 'Quick actions',
    keywords: 'overdue late tasks review',
  },
  {
    path: '/approvals',
    label: 'Pending approvals',
    description: 'Consequential actions waiting on you',
    icon: <InboxOutlined />,
    group: 'Quick actions',
    keywords: 'approve reject pending decisions',
  },
];

function SafetyIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 19 6v5.1c0 4.3-2.7 7.6-7 9.4-4.3-1.8-7-5.1-7-9.4V6l7-2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m9 12 2.1 2.1L15.5 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function activeNavPath(pathname: string) {
  if (pathname === '/') return '/';
  const first = pathname.split('/').filter(Boolean)[0];
  return first ? `/${first}` : '/';
}

export function navEntryForPath(pathname: string) {
  const key = activeNavPath(pathname);
  return NAV_ENTRIES.find((entry) => entry.path === key);
}
