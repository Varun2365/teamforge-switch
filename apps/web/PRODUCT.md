# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Founders, operations leads, and project managers at small-to-mid-sized organizations who run the day-to-day work of the company. They use the dashboard as a daily operations desk: checking what is at risk, what is waiting on a human, who is overloaded, and what the organization has decided. Hackathon evaluators also use it to verify that the Switch agents and organizational memory are real, not staged.

## Product Purpose

TEAMFORGE is an AI operations desk for a team. It understands the organization's people, skills, projects, tasks, decisions, commitments, and timelines, and keeps work moving proactively. The dashboard exists to make that operational truth visible and actionable for humans: it surfaces risk, pending approvals, agent activity, and organizational memory, and lets a human act on it.

## Positioning

Six always-on Switch agents live in one shared room. Humans do not mention anyone: unaddressed messages go to the operations manager, specialists join when needed, and every claim is grounded in tool data. Organizational memory is temporal and sourced, and consequential actions stop for human approval. The product is not a generic chatbot or a standalone project tracker.

## Operating Context

The primary conversational surface is a Discord channel bridged to a Switch room. The dashboard runs alongside it as the read-and-act surface. A demo organization (Acme Technologies) is seeded for evaluation. The API runs on :4100 and the dashboard on :5183 in local development. The dashboard authenticates with the same organization API key as the API; the key is injected in dev and can be overridden in Settings.

## Capabilities and Constraints

Nine live pages: Overview, People, Org Graph, Projects, Tasks, Memory, Approvals, Agents, and Settings. Existing behavior includes task creation and completion, approval approve/reject, memory proposal approve/reject, and fact correction. All existing API calls, query keys, mutations, routes, and data shapes are product truth and must keep working. The dashboard is read-heavy; do not invent activity, claims, customers, or metrics. Agent activity and demo flags must remain honest. Stack: React 18, Vite, TypeScript, React Router, TanStack Query. The visual layer is being replaced with Ant Design; the API and backend are out of scope.

## Brand Commitments

The product name is TEAMFORGE, described as an "ops desk." Its voice is direct, calm, and honest. No silent fake activity: every agent action is logged and failures surface. The user explicitly chose Ant Design's azure `#1677FF` as the accent and asked for a clean, modular, professional, elegant interface.

## Evidence on Hand

`README.md` documents the verified live system, architecture, commands, and honest notes. `docs/ARCHITECTURE.md`, `docs/SWITCH_INTEGRATION.md`, `docs/MEMORY_ENGINE.md`, `docs/AGENT_ROLES.md`, `docs/API.md`, and `docs/DEMO_GUIDE.md` document the mechanisms. `apps/web/src/lib/api.ts` and `hooks.ts` contain the real response shapes. Seeded Acme data provides real demonstrations. There are no customer logos, testimonials, or benchmarks to reuse.

## Product Principles

1. Truth over vibes: every number, status, and agent action is backed by tool data and carries its provenance.
2. Human control at the consequential edge: approvals are a first-class surface, not a settings page.
3. Calm under load: dense operational information should still scan in seconds.
4. One operating picture: people, projects, tasks, memory, and agents are views of the same organization, not separate silos.
5. The room is the front door; the dashboard is where you verify and act.

## Accessibility & Inclusion

The dashboard should be fully keyboard-operable, with visible focus states, semantic landmarks, readable contrast at the 14px base size, and no color-only status encoding. Respect reduced-motion preferences.
