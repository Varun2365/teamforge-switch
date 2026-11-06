# TEAMFORGE — Build Phases

> TEAMFORGE: an AI Operations Manager for organizations, powered by **Switch**.
> Stack: Node + TypeScript · Fastify · **MongoDB** (`teamforge-ops`) · Mongoose · Zod · React+Vite+Tailwind v4 · MCP tools · Switch (Switch Rooms / Agent Protocol, local server :56565).
>
> **How to use this file:** flip `[ ]` → `[x]` only when built **and verified**. Notes show what "verified" meant for each step (typecheck, tests, live run, screenshot).
>
> Date started: 2026-11-06 · Owner: build agent

Legend: `[x]` done & verified · `[ ]` pending · ⚠️ blocked on owner action

---

## Phase 0 — Repo & Tooling

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 0.1 | Root npm workspaces + TS base config | [x] | typecheck green all workspaces |
| 0.2 | `.env.example` placeholders, `.env` gitignored | [x] | no secrets in git; dev key local |
| 0.3 | `.gitignore` | [x] | incl. `switch/agents/**/opencode.json` |
| 0.4 | This PHASES.md | [x] | continuously updated |

## Phase 1 — Foundation & Data Layer (MongoDB)

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 1.1 | Mongo connection + org-scoping helpers | [x] | verified `/health` → mongo connected |
| 1.2 | Org/people schemas (org, departments, teams, memberships) | [x] | uuid string ids |
| 1.3 | Users/profiles/skills/aliases schemas | [x] | |
| 1.4 | Memory-graph schemas (entities, types, relationships, facts, events, sources, proposals, memory_versions) | [x] | append-only temporal facts |
| 1.5 | Ops schemas (projects, milestones, tasks, assignments, dependencies, commitments, decisions, meetings) | [x] | |
| 1.6 | Governance schemas (approvals, reminders, jobs, audit, agent_actions, notifications, room_mappings) | [x] | |
| 1.7 | UUID ids + indexes (org, status, dueDate, assignee, normalizedName, source refs) | [x] | |
| 1.8 | Mongo as **installed Windows service**; isolated `teamforge-ops` db; `teamforge-test-ops` for tests | [x] | a stray build on this machine shares `teamforge` — our db is isolated; 194 accidental docs cleaned |
| 1.9 | Seed — Acme Technologies (5 people, Website Launch, 5 tasks, 4 deps, decisions, provenance) | [x] | idempotent per-org wipe, ran clean |
| 1.10 | Fastify server + `/health` | [x] | live on :4100 |

## Phase 2 — Switch Integration (Switch is CENTRAL)

> **Final live architecture (2026-11-06, verified against server 0.31.0):** six **custom always-on Switch agent clients** run inside the API process (same architecture as the earlier `D:\WeMakeDevs` build, re-implemented on TEAMFORGE's stack). They connect with `scope=all, filter=all`, so **unaddressed human messages are answered by the operations manager** — no mention required. Specialists answer explicit @mentions or `TEAMFORGE_HANDOFF` delegations; agent/system messages are never answered (loop prevention). The deterministic tool-grounded brain calls the live tool registry; no third-party LLM keys anywhere. Room auto-provisioned on the existing Discord bridge.

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 2.1 | Live server recon (bridge 56565, Gateway 56564, server 0.31.0) + `docs/SWITCH_INTEGRATION.md` | [x] | operations schemas read from the live registry |
| 2.2 | WebSocket agent client (connection_state, ping/pong, resume, evicted, subscription_changed) | [x] | live: 6/6 connected |
| 2.3 | Agent registration via `POST /agents` (tools descriptions required) + addressing policy via Gateway | [x] | all six registered (`-tf` suffix) |
| 2.4 | Message ingest → persist (unique switchMessageId + source) → routing → atomic claim → reply | [x] | loop prevention verified live |
| 2.5 | Room auto-provision on the Discord bridge; members bound; bridge metadata stored | [x] | `teamforge-lobby` + fresh Discord channel |
| 2.6 | No-mention routing (unaddressed → ops; mentions → one agent; handoffs; ignore agent/system) | [x] | pure module + unit tests |
| 2.7 | Live human smoke test in Discord (`teamforge-lobby`, no mention) | [ ] | ⏳ waiting for the owner to type in the channel |

## Phase 3 — Business Services, Tools & MCP

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 3.1 | Tool registry (Zod in/out, org scope, tiers, audit, duration) | [x] | 30 tests green incl. org isolation |
| 3.2 | Org tools (9/9) | [x] | verified via MCP tools/call |
| 3.3 | Memory tools (11/11) | [x] | |
| 3.4 | Project tools (6/6) + Task tools (10/10) | [x] | fixed list→assignee join bug found in screenshot review |
| 3.5 | Coordination tools (7/7) | [x] | |
| 3.6 | Scheduling tools (6/6) + Risk tools (4/4) | [x] | live reminder→delivery verified |
| 3.7 | REST routes (overview, graph, people, memory, projects, tasks, approvals, reminders, agents) | [x] | dashboard consumes these |
| 3.8 | MCP endpoint | [x] | see 2.5 |
| 3.9 | OpenAPI at `/openapi.json` + `/docs` | [x] | hand-written, route-map type |

## Phase 4 — Organizational Memory Engine

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 4.1 | Entity CRUD + extensible types | [x] | core types seeded; org-custom allowed |
| 4.2 | Relationship engine (dynamic, temporal, provenance) | [x] | |
| 4.3 | Temporal facts — supersede, never overwrite; full history | [x] | tests prove supersession + versions |
| 4.4 | Entity resolution (exact → alias → fuzzy; ambiguous asks, never guesses) | [x] | tests for ambiguous/no_match |
| 4.5 | Memory ingestion — AI-driven via agents (`propose_memory_update`) | [x] | regex extractor REMOVED by owner direction; backend validates/gates only |
| 4.6 | Proposals → apply (auto ≥0.85 conf + source; sensitive → approval) | [x] | approve/reject flow tested |
| 4.7 | Search (regex-scored; embeddings can slot behind same tool later) | [x] | |
| 4.8 | Contradictions: shaky (<0.5 conf) → disputed + proposal; history preserved | [x] | live-tested via API |

## Phase 5 — Six Agents & Switch Collaboration

> **Live architecture:** the six agents are always-on custom Switch clients inside the API (see Phase 2). Their behaviour lives in `agent-brain.ts` (grounded, tool-scoped per role) and `routing.ts` (who answers). The instruction files remain as the canonical role/voice specification and the humanized-output contract.

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 5.1 | Six agent identities registered on the Switch server (suffix `-tf`), always-on connections | [x] | 6/6 online live |
| 5.2 | Operations Manager: unaddressed entry point, grounded answers, delegation, reminders | [x] | live + tests |
| 5.3 | Project Manager: plans, tasks, dependencies, health, overdue re-plan hints | [x] | tests |
| 5.4 | Knowledge & Memory: memory search, entity resolution, history answers | [x] | tests |
| 5.5 | Communication & Coordination: follow-ups, reminders, status nudges | [x] | tests |
| 5.6 | Research & Strategy: memory-grounded read, no fabrication | [x] | tests |
| 5.7 | Quality & Risk: risk analysis + blast radius + recommendations | [x] | wired to live risk tools |
| 5.8 | Handoffs via `TEAMFORGE_HANDOFF` marker (ops → specialist, addressed reply) | [x] | parse/build tested; loop-safe |
| 5.9 | Single-voice room: unaddressed → ops only; specialists on mention/handoff | [x] | routing tests + live setup |
| 5.10 | Humanized voice layer (style guide + `deRoboticize` post-pass + name/contraction rules) | [x] | tests |
| 5.11 | Zero third-party LLM/tool providers | [x] | deterministic engine by design |

## Phase 6 — Proactive Intelligence (reminders, schedulers)

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 6.1 | Persistent Mongo-backed scheduler (claim-with-lock, attempts, backoff) | [x] | verified live fire |
| 6.2 | One-time + recurring reminders, snooze, cancel, quiet hours, daily caps | [x] | |
| 6.3 | Morning brief worker (real data, human voice) | [x] | composes from live tasks/approvals |
| 6.4 | Overdue scan → dependency blast radius → targeted nudge + manager escalation | [x] | `get_affected_dependencies` integrated |
| 6.5 | Deadline follow-ups (T-26h) + commitment checker | [x] | |
| 6.6 | Delivery through the agent runtime into the Switch room (dashboard fallback when offline, labelled) | [x] | same deliverProactive path the agents use |
| 6.7 | Timezone-aware quiet hours (org + user overridable) | [x] | Asia/Kolkata default |

## Phase 7 — Dashboard (React + Vite + Tailwind)

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 7.1 | App shell + design tokens + primitives | [x] | build green |
| 7.2 | Overview | [x] | screenshot-verified with live data |
| 7.3 | People + profile drawer | [x] | |
| 7.4 | Org graph (SVG radial, click→inspect) | [x] | screenshot-verified |
| 7.5 | Projects (cards + detail drawer) | [x] | |
| 7.6 | Tasks (list + Kanban + create + complete) | [x] | assignee-join bug fixed & re-verified |
| 7.7 | Memory (search, entities, facts, correction, proposals) | [x] | |
| 7.8 | Approvals (approve/reject + note + audit history) | [x] | seeded approval card verified |
| 7.9 | Agents (identities + live activity feed; demo-labelled) | [x] | |
| 7.10 | Settings (org, Switch status, API key) | [x] | |

## Phase 8 — Testing, Docs & Polish

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 8.1 | Unit tests (routing/handoff, brain grounding, resolution, temporal supersession, voice, cycle detect) | [x] | 39/39 green (6 files) |
| 8.2 | Integration workflow: tool contract agents depend on (create→assign→cycle→approve) + live Switch routing | [x] | backend + brain against real tools; live human E2E pending 2.7 |
| 8.3 | Reminder idempotency + worker delivery + no double-fire | [x] | live + vitest |
| 8.4 | README + ARCHITECTURE | [x] | |
| 8.5 | MEMORY_ENGINE · AGENT_ROLES · API · DEMO_GUIDE · SWITCH_INTEGRATION | [x] | |
| 8.6 | Final verification: clean seed → all builds → tests → live agent runtime | [x] | 2026-11-06: builds green, 39/39 tests, 6/6 agents online, room auto-provisioned on Discord |

---

## Definition of Done (first version) — where we stand

1. Starts locally w/ docs ✅ · 2. Mongo persists ✅ · 3. Switch integrated & live ✅ · 4. Room live on Discord (auto-created) ✅ · 5. Agents live (6/6 online) ✅ · 6. Handoff mechanism live & tested ✅ · 7. Agents call real tools ✅ · 8–13. ✅ (tested) · 14. Reminder delivers ✅ · 15. Dashboard shows records ✅ · 16. Historical memory ✅ · 17. Org permissions ✅ · 18. README ✅

> Remaining honest gap: a human has not yet typed in `#teamforge-lobby` as the final E2E proof (2.7). Everything on our side — registration, presence, ingest routing, loop prevention, posting, tool grounding — is verified live.
