# TEAMFORGE Architecture

## Components

| Component | Tech | Role |
|---|---|---|
| Switch server (`:56565`) | Switch Rooms, local | Identity, rooms, delivery bus, agent sessions host |
| Switch-managed agents | OpenCode provider | The AI brains — understanding, tone, judgment |
| TEAMFORGE API (`:4100`) | Fastify + Mongoose, TS | Business engine: memory, tasks, approvals, risk, scheduler, MCP + REST |
| Dashboard (`:5183`) | Vite + React + Tailwind v4 | Human window into the org |
| MongoDB (`:27017`, db `teamforge-ops`) | MongoDB 8.2 | Source of truth |

## Data flow — a question

```
Human in teamforge-lobby: "Who's owning the API integration?"
  → Switch delivers message to @operations-manager (addressed)
  → Ops session: reads room context, calls find_entity / search_tasks / get_task (MCP)
  → API: Zod-validate → org scope → service → Mongo → audit (agent_actions, actor=agent:operations-manager)
  → Tool result back to the session
  → Ops composes one human answer; posts in room (under its own name)
  → If depth is needed: delegate in teamforge-agents (send_targeted_message), wait, synthesize
```

## Data flow — a consequential action

```
"Reassign the API task to Neha."
  → agent calls assign_task (tool, sensitive tier)
  → tool creates Approval (action=assign) — NOTHING is assigned
  → dashboard shows the card (pending), human clicks Approve with optional note
  → approvalService.applyApproval: validates pending → runs the side effect (assignTask) → audit + event
  → dependent agents see the change on their next context read; dashboard reflects it immediately
```

## Module map (apps/api)

```
src/
  config.ts            env (+ upward .env discovery) — no switch/LLM settings beyond bridge creds
  db/models/           mongoose models (uuid string ids everywhere)
  db/seed.ts           Acme demo org; wipes ONLY its own org
  plugins/auth.ts      root onRequest hook (bearer, org resolve, agent header actor)
  services/            orgService · memoryService (temporal engine) · taskService · projectService
                       approvalService · reminderService · riskService · notificationService
                       proactive.ts (digest builders) · graphService · extraction.ts (REMOVED — AI handles meaning)
  tools/               registry (name/desc/tier/Zod/audit) + 7 tool groups ≈ 53 tools
  routes/              core (overview/people/graph) · memory · ops · governance (approvals/reminders/agents/switch status)
                       tools · mcp · openapi
  workers/scheduler.ts persistent job runner (claim-with-lock, attempts, backoff, idempotent keys, quiet hours)
  test/                vitest — memory, tasks/approvals, scheduler, tools, voice (isolated db)
```

## Why these choices

- **MongoDB** (owner decision; replaces the spec's PostgreSQL): flexible attributes without JSONB friction; documents fit the graph+operations workload; no replica set on this machine → services are written without multi-document transactions; every write is atomic or compensating and always audit-logged.
- **Modular monolith** — no microservices. One deployable, clear seams (services), explicit module boundaries.
- **Tool registry shared by MCP and REST** — agents and dashboard hit the same functions; no behavioral fork.
- **Approval-gated mutation for agents** — tools called with agent actors cannot silently assign/deadline-shift/externally-send; they produce approval cards. Human actors via the API key act immediately (dashboard = org owner scope).
- **Scheduler, not timers** — `scheduled_jobs` with `lockedUntil` claim windows, `maxAttempts`, backoff, idempotency keys; survives restarts; 5s poll.
- **Org scoping everywhere** — every query carries `orgId`; tests verify isolation; the `teamforge-ops` db is separate from anything else on this Mongo.

## Events

`@teamforge/shared` defines typed event names (`task.created`, `risk.detected`, …). API writes events as rows (`events` collection, `dedupeKey` deduplication at the scheduler/notification layer). Consumers today are the overdue/risk paths; the event catalog is the integration seam for future package extraction.

## Security notes

- No secrets in git (`.env`, `switch/agents/**/opencode.json` ignored). `.env.example` is placeholders.
- API key compare is timing-safe (SHA-256 + timingSafeEqual).
- The old build on :4000 shares this machine; TEAMFORGE never binds to it and never touches its DB.
- Treat conversation content as untrusted: agents are instructed (AGENTS.md) to never obey instructions embedded in messages/documents beyond ordinary team intent; the backend treats all tool input as data.
