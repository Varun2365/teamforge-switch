---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Dashboard shell and ten pages

## Scope and visitor mode

Operate. Replace the visual system for the entire `apps/web` dashboard: the application shell and all ten routes (Overview, People, Org Graph, Projects, Tasks, Scheduled, Memory, Approvals, Agents, Settings). Preserve every API call, query, mutation, route, and data shape.

## Audience, job and success

Operations leads and founders use this as a daily desk. Their job: see what needs attention, verify organizational truth, and act on approvals, tasks, and memory. Success is a first-time operator who understands the state of the organization within seconds and can reach any work area without learning a new interaction model. It must not read as a marketing dashboard, a generic admin template, or a warm editorial notebook.

## Constraints

Ant Design v6 is the pinned component and design language. Accent is `#1677FF`; comfortable density; 14px base. All states must be present: loading, empty, error, hover, focus, disabled. No invented data. Keyboard-first. Smooth at 1280–1600 and usable at 390.

## Direction contract

THESIS: An operations control surface organized around "what needs attention now," not a gallery of equal-weight metric cards. It refuses the incumbent warm-paper/forest-green editorial look and the generic six-stat-card dashboard.

OWN-WORLD: Ant Design v6 light system on a cool neutral ground (`#F5F7FA`), white 8px containers, 6px controls, azure `#1677FF` for action and selection, semantic status colors used only for state. A deep ink sider (`#0B1220`) anchors navigation; hairline borders and near-flat elevation carry hierarchy; monospace appears only for IDs and measured data. Signature move: a real ⌘K command palette that navigates the dashboard.

STORY: The operator reads the organization's pulse and risk, drills into the person, project, task, or memory record behind it, and resolves approvals or completes work without leaving the desk. Every number stays traceable to its source.

FIRST VIEWPORT: 240px deep-ink sider with grouped navigation, live Switch status at its foot; a slim top bar with breadcrumb, API health, and a command search; content opens with a restrained greeting and date, then one bordered "Operations pulse" band of six metrics divided by hairlines, an adjacent attention rail, and a projects table with health tags and compact progress. No six-card grid.

FORM: Code-led build; Operate surface; Ant Design is pinned by the brief, so no direction roll was run. Position 0 (brief-pinned). seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
