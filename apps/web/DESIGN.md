---
name: TEAMFORGE Operations Desk
description: A calm, Ant Design-based operations surface for human and AI teams.
colors:
  primary-azure: "#1677ff"
  primary-azure-hover: "#4096ff"
  primary-azure-active: "#0958d9"
  ink: "#0f172a"
  ink-secondary: "#475569"
  ink-tertiary: "#64748b"
  surface: "#ffffff"
  ground: "#f5f7fa"
  hairline: "#e6eaf0"
  hairline-soft: "#eef2f7"
  sider: "#0b1220"
  success: "#16a34a"
  success-deep: "#166534"
  success-soft: "#e8f6ed"
  warning: "#d97706"
  warning-deep: "#92400e"
  warning-tint: "#fef3c7"
  error: "#dc2626"
  error-deep: "#991b1b"
  error-soft: "#fee2e2"
  info: "#1677ff"
  info-soft: "#e6f4ff"
  neutral-soft: "#f1f5f9"
  selection: "#d6e8ff"
  sider-secondary: "#aeb9c8"
  sider-label: "#7f90a6"
  live-green: "#22c55e"
  live-halo: "rgba(34, 197, 94, 0.12)"
  hover-border: "#bcd6ff"
  danger-soft: "#fef2f2"
  warning-soft: "#fffbeb"
  categorical-cyan: "#13c2c2"
  categorical-purple: "#722ed1"
  categorical-gold: "#faad14"
  categorical-geekblue: "#2f54eb"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.2
  metric-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1
  metric-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1
  detail:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  title-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.45
  body-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  label-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  caption-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
  micro-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
    fontSize: "9.5px"
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "4px"
  sm: "6px"
  nav: "7px"
  md: "8px"
  brand: "9px"
  panel: "10px"
  lg: "12px"
  overlay: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-azure}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-azure-hover}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 15px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "4px 11px"
  tag:
    backgroundColor: "{colors.hairline-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 7px"
  nav-item-selected:
    backgroundColor: "rgba(22, 119, 255, 0.18)"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "38px"
---

# Design System: TEAMFORGE Operations Desk

## Overview

**Creative North Star: "The Signal Desk"**

TEAMFORGE is a working desk, not a showcase. The surface is built so an operations lead can read the organization's pulse, find the one thing that needs a human, and act without decoding a new interface. Familiar Ant Design patterns carry the interaction; the identity comes from restraint, a deep ink navigation rail, and a single azure signal that marks action and current position.

The visual temperature is cool and certain: a light `#F5F7FA` ground, white working surfaces, hairline borders, and near-flat elevation. Density is comfortable — 14px base type, 34px controls, 20px card padding — so information stays scanable without becoming a spreadsheet. The interface never uses decoration to imply activity; every status is text plus colour, and every number is traceable to the API.

**Key Characteristics:**
- Ant Design v6 as the component language, themed through tokens rather than overridden CSS.
- A 248px deep-ink navigation rail against a light three-layer surface model.
- Azure `#1677FF` as the only action/selection accent; semantic colours only for state.
- Flat-by-default surfaces with 1px hairline borders; shadows reserved for floating layers.
- A functional ⌘K command palette as the signature interaction.

## Colors

The palette is a restrained product palette: one azure signal, four neutral layers, and four semantic state colours. Preset Ant colours (cyan, purple, gold) appear only as categorical data in the org graph and agent identities.

### Primary
- **Signal Azure** (`#1677FF`): primary buttons, links, focus rings, active navigation, selected segments, and the current tab. Hover is `#4096FF`; active is `#0958D9`.
- **Deep Ink** (`#0B1220`): the navigation rail ground and the strongest neutral. It is not used for body copy.

### Neutral
- **Working Ink** (`#0F172A`): headings and primary values.
- **Secondary Ink** (`#475569`): body copy, descriptions, table body, secondary actions.
- **Tertiary Ink** (`#64748B`): labels, metadata, timestamps, placeholders. This is the floor for small text contrast.
- **Hairline** (`#E6EAF0`): card and control borders.
- **Hairline Soft** (`#EEF2F7`): internal dividers, table row borders, metric separators.
- **Ground** (`#F5F7FA`): the page and content background.
- **Surface** (`#FFFFFF`): cards, tables, drawers, headers.

### Semantic
- **Success** (`#16A34A`): on-track health, connected agents, zero-risk counts.
- **Warning** (`#D97706`): at-risk health, blocked work, pending approvals.
- **Error** (`#DC2626`): off-track health, overdue counts, rejected or disputed states.
- **Info** (`#1677FF`): informational tags; it shares the primary azure deliberately.

### Named Rules
**The One Azure Rule.** Azure is spent on action, current selection, and data focus only. It is never a decorative background, a chart series by default, or a second brand colour.

**The Text Plus Colour Rule.** Status is never encoded by colour alone. Every health, priority, and approval state carries a written label beside its tint.

## Typography

**Display Font:** system UI stack (`-apple-system`, `Segoe UI`, `Roboto`, `Noto Sans`)
**Body Font:** the same system stack
**Label/Mono Font:** `SFMono-Regular` / `Consolas` for IDs, predicates, room names, and agent keys only

**Character:** A single workhorse family keeps the interface quiet and native to each operating system. Weight and spacing carry hierarchy; there is no display face competing with the data.

### Hierarchy
- **Headline** (600, 26px/1.2, -0.025em): the page title. One per route.
- **Title** (600, 16px/1.35): card titles, drawer titles, and section headings.
- **Body** (400, 14px/1.5): table content, descriptions, controls, and prose.
- **Label** (600, 12px/1.4, 0.08–0.13em uppercase): card labels, table headers, and micro-section labels.
- **Code** (400, 12px/1.5): identifiers, predicates, room IDs, and measured data.

### Named Rules
**The Tabular Numbers Rule.** Counts and metrics use tabular numerals so columns and metric bands never shift as values change.

**The No-Costume Mono Rule.** Monospace is for code, identifiers, and measured data. It never stands in for "technical" styling on labels or buttons.

## Layout

A fixed 248px navigation rail, a 60px top bar, and a fluid content stage capped at 1480px. Content padding is 32px on desktop, 20px on tablet, and 16px on mobile. The spacing rhythm follows a 4px grid: 4 / 8 / 16 / 20 / 24 / 32 / 56. Tight groups sit at 8–12px; card internals at 20px; page sections at 20px; page gutters at 32px.

The Overview uses a full-width six-cell pulse band, a full-width attention strip, then paired work areas on a 24-column grid (15/9 and 9/15). Tables are the primary dense surface; cards are containers, never the page structure.

Breakpoints: 1360px collapses the pulse band to three columns and the attention strip to three; 1023px turns the navigation rail into an overlay; 768px stacks page headers, turns the board into a single column, and drops metric bands to two columns. Responsive behaviour is structural, never fluid typography.

## Elevation & Depth

The system is flat-first. Depth comes from tonal layers — ground, surface, hairline — not from drop shadows. Cards sit on the ground with a 1px border and no shadow at rest. Shadow appears only when a surface genuinely floats: the command palette, drawers, dropdowns, and tooltips. Hover on a project card may add a 2px ambient shadow as state feedback, never as decoration.

### Shadow Vocabulary
- **Overlay** (`0 24px 70px rgba(15, 23, 42, 0.22)`): the command palette and other protected-focus overlays.
- **Floating** (`0 6px 20px rgba(15, 23, 42, 0.08)`): dropdowns, popovers, and tooltips.
- **Hover lift** (`0 2px 8px rgba(15, 23, 42, 0.06)`): project cards and task cards on hover only.

### Named Rules
**The Hairline Rule.** If a surface is not floating, it earns a 1px border instead of a shadow. A zero-offset coloured halo is never depth.

## Shapes

Surfaces use a 12px corner; controls use 8px; tags use 6px; avatars, status dots, and the brand mark use full circles or a 9px square. The hierarchy is consistent: larger surface, softer corner. Borders are 1px and always the hairline colour. Nothing is clipped to a polygon or given a decorative notch.

## Components

### Buttons
- **Shape:** 8px corners, 34px height, 15px horizontal padding.
- **Primary:** signal azure fill, white text, no shadow. Hover lightens to `#4096FF`; active darkens to `#0958D9`.
- **Default:** white surface, hairline border, ink text. Hover tints the border and text toward azure.
- **Danger:** Ant Design danger semantics; used for reject and destructive approval actions only.
- **States:** default, hover, focus-visible, active, disabled, loading. One primary action per decision surface.

### Chips and Tags
- **Style:** 6px corners, 12px type, pale semantic tint, no heavy border.
- **Role:** health, status, priority, entity type, and categorical agent colour. Tags never replace an Alert for a critical state.

### Cards and Panels
- **Corner style:** 12px.
- **Background:** white on `#F5F7FA`.
- **Border:** 1px `#E6EAF0`; internal dividers 1px `#EEF2F7`.
- **Padding:** 20px; flush tables and the attention strip set body padding to 0.
- **Header:** 48px minimum, 13.5px semibold title, optional 12.5px action link.

### Inputs and Fields
- **Style:** white surface, 1px hairline, 8px radius, 34px height.
- **Focus:** azure border plus Ant's soft focus ring; placeholder text is `#64748B` for readable contrast.
- **Search:** a leading search glyph and a clear affordance; the large memory search uses 40px height.
- **Forms:** vertical labels, 12px label type, required rules stated in the field; errors name the problem and recovery.

### Navigation
- **Desktop:** 248px deep-ink rail, grouped labels, 38px items, 8px horizontal inset, azure-tinted selected pill. The selected item never uses a detached side bar.
- **Footer:** live Switch status, agent count, room name, and the no-mention note.
- **Mobile:** the rail becomes a fixed overlay with a scrim; a header menu button toggles it and closes on route change.
- **Top bar:** breadcrumb, command trigger, approvals bell with count, and the organization identity.

### Signature Component: Command Palette
The ⌘K / Ctrl K palette is the one authored interaction. It opens over any route, filters pages and quick actions as you type, supports arrow-key navigation and Enter to open, and closes on Escape or the mask. Its footer teaches the keys. It is a functional shortcut, not a decorative overlay.

### Tables and Drawers
- Tables use a soft header ground, 12px vertical cell padding, hairlines between rows, hover tint, and horizontal scroll on narrow screens. Rows that open a detail surface are keyboard-focusable.
- Drawers are 480–560px, right-aligned, with a 24px body and a close affordance. They are used for inspection and correction, not for primary navigation.

## Do's and Don'ts

### Do:
- **Do** use Ant Design components and theme tokens; change the system through `ConfigProvider`, not one-off CSS.
- **Do** keep azure for action, current selection, and focus only.
- **Do** put a written label beside every status colour.
- **Do** use 4px-grid spacing: 8/16/20/24/32.
- **Do** show loading, empty, error, hover, focus, and disabled states.
- **Do** keep table rows and custom clickable surfaces keyboard-focusable.
- **Do** use monospace only for IDs, predicates, room names, and measured data.

### Don't:
- **Don't** introduce a second accent colour or a decorative gradient.
- **Don't** add shadows to resting cards; use hairlines and tonal layers.
- **Don't** use a hero-metric template or a grid of identical icon cards as page structure.
- **Don't** use coloured left borders above 1px on cards, alerts, or list items.
- **Don't** encode health or priority with colour alone.
- **Don't** set body or placeholder text below 4.5:1 contrast.
- **Don't** hide the primary action behind a modal when an inline form will do.
- **Don't** invent activity, metrics, or agent claims to fill an empty state.
