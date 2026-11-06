# TEAMFORGE

**AI-powered organizational intelligence & operations — powered by [Switch](https://docs.switchagents.ai/).**

TEAMFORGE is the AI operations desk for a team: it understands the organization, runs the work, and proactively keeps people honest — with six agents that live in your **Switch** room. **You don't mention anyone.** Type in the Discord channel and the operations manager picks it up; it grounds every answer in the actual org data, pulls in specialists when needed, and asks for human approval before anything consequential.

> Built for the Switch hackathon. Switch is the front door and the fabric: six always-on Switch agent clients, one shared room, all human↔agent and agent↔agent traffic through Switch. No third-party model provider.

## What is live right now

| Area | Status |
|---|---|
| Six agents registered on the local Switch server (`ops-manager-tf` … `quality-risk-tf`), **6/6 online** | ✅ verified live |
| Room **`teamforge-lobby`** auto-created on the **Discord bridge** (fresh channel) | ✅ verified live |
| **No-mention UX**: unaddressed human messages → operations manager; @mentions route to a single specialist; agent chatter never loops | ✅ verified live + unit-tested |
| Deterministic, tool-grounded brain (status, ownership, overdue/risk, decisions, skills, reminders, commitments) | ✅ 39/39 tests |
| Business engine: ~53 tools over MCP `/mcp` + REST, MongoDB `teamforge-ops` (isolated DB) | ✅ |
| Organizational memory: temporal facts, supersession, aliases, provenance, approvals | ✅ |
| Persistent scheduler: reminders, morning brief, overdue scans with blast radius, deadline/commitment follow-ups | ✅ live |
| Dashboard (9 pages) | ✅ |
| Proactive posts through the Switch room via the agent runtime | ✅ wired (same deliverProactive path) |
| Third-party LLM keys | none — by design |

## Architecture

```
Discord (#teamforge-lobby)  ◄──bridge──►  Switch server (:56565)
                                                ▲  always-on WebSocket per agent
                                                │  scope=all, filter=all
                                  TEAMFORGE API (:4100)
                                  ├─ six agent clients + routing (routing.ts)
                                  ├─ grounded brain (agent-brain.ts) → tools
                                  ├─ memory · approvals · scheduler · REST
                                  └─ dashboard (:5183)
                                                │
                                          MongoDB (:27017, teamforge-ops)
```

Design rules: unaddressed → operations manager only; specialists answer mentions/handoffs; consequential actions become approval cards; memory is temporal with sources; no agent-made claim goes unbacked by tool data.

## Quickstart (this machine)

Prereqs already present: Node 24, MongoDB 8.2 service, **Switch Console** (keep it open — its local server powers the bridge), a Discord server connected to that Switch server.

```powershell
cd D:\SwitchHackathon2
npm install
npm run seed          # Acme Technologies demo org (idempotent, acme only)
npm run dev           # API :4100 — registers + connects the six agents on boot
npm run dev:web       # dashboard :5183
```

Watch the boot log for:

```
[teamforge] Switch runtime: 6/6 agents online · room <uuid>
```

Then open your Discord server → channel **`teamforge-lobby`** and type anything (no @). Full runbook: `switch/README.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + Switch runtime (:4100) |
| `npm run dev:web` | Dashboard (:5183) |
| `npm run seed` | Recreate the Acme demo org |
| `npm test` | 39 tests (isolated `teamforge-test-ops` db) |
| `npm run typecheck` / `npm run build` | TS across workspaces / full build |
| `npm run check:mcp` | MCP initialize + tools/list + optional tool call |
| `npm run verify:switch` | Switch bridge health probe |

## Ports

| Port | Service |
|---|---|
| 4100 | TEAMFORGE API (REST, `/mcp`, `/health`, `/openapi.json`, `/docs`) |
| 5183 | Dashboard |
| 56565 | Switch agent bridge (inside Switch Console) |
| 56564 | Switch Gateway (admin) |
| 27017 | MongoDB |
| ~~4000~~ | **Untouched** — an older build listens here; TEAMFORGE never binds to it |

## Honest notes

- **Switch Console must stay open.** It runs the local Switch server; when it's closed, agents reconnect automatically once it's back.
- The brain is deterministic and tool-grounded — excellent on operational truth, not a free-form essayist. An optional LLM backend is documented as future work, never required.
- Agent names carry the `-tf` suffix so this build never hijacks agents from any earlier build on the same server.
- No silent fake activity: every agent action is logged; failures surface in the room and in the dashboard.

Docs: `docs/ARCHITECTURE.md` · `docs/SWITCH_INTEGRATION.md` · `docs/MEMORY_ENGINE.md` · `docs/AGENT_ROLES.md` · `docs/API.md` · `docs/DEMO_GUIDE.md` · build ledger `PHASES.md`.
