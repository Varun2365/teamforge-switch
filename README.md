# TEAMFORGE

**AI-powered organizational intelligence & operations — powered by [Switch](https://docs.switchagents.ai/).**

TEAMFORGE is the AI operations desk for a team: it understands the organization, runs the work, and proactively keeps people honest — with six agents that live in your **Switch** room. **You don't mention anyone.** Type in the Discord channel and the operations manager picks it up; it grounds every answer in the actual org data, pulls in specialists when needed, and asks for human approval before anything consequential.

> Built for the Switch hackathon. Switch is the front door and the fabric: six always-on Switch agent clients, one shared room, all human↔agent and agent↔agent traffic through Switch. No third-party model provider.

## What is live right now

| Area | Status |
|---|---|
| Six agents registered on the local Switch server (`ops-manager-tf` … `quality-risk-tf`), **6/6 online** | ✅ verified live |
| Room **`teamforge-lobby`** auto-created on the **Discord bridge** (fresh channel) | ✅ verified live |
| **No-mention UX**: every human message → the AI ops manager; @mentions route to a single specialist; agent chatter never loops | ✅ verified live + unit-tested |
| **AI brain via your OpenCode plan** (headless): the model decides retrieval, memory writes, tasks/reminders and wording — no templates, no regex intent routing, no third-party API keys | ✅ verified live (real reply + stored memory) |
| **Self-growing org memory**: people created from their Discord identity, meetings/decisions/commitments stored with sources by the AI | ✅ verified (event + reminder + person entity from one message) |
| **No demo data**: bootstrap only creates the organization; the team builds the record by talking | ✅ 173 sample docs removed |
| Business engine: ~53 tools over MCP `/mcp` + REST, MongoDB `teamforge-ops` (isolated DB) | ✅ |
| Organizational memory: temporal facts, supersession, aliases, provenance, approvals | ✅ |
| Persistent scheduler: reminders (@mentions the person in the room), morning brief, overdue scans, deadline/commitment follow-ups | ✅ verified live |
| Dashboard (9 pages) | ✅ |

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

- **There is no demo data.** `npm run seed` bootstraps the organization and background jobs only. People, projects, tasks and memory come from real conversation; the AI stores them as the team talks.
- **The AI lives in your OpenCode plan** (headless `opencode run` with the TeamForge MCP server attached). If the CLI is unavailable, the API falls back to a safe offline engine and says so in logs — never fake answers.
- The first time someone speaks, a teammate record is created from their Discord identity automatically. Introductions ("I'm X, I do Y") become their profile.
- Reminders are delivered as real room messages that **@mention** the person via Switch targeting.
- Switch Console must stay open; closing it disconnects agents until it returns.
- The brain runs with the owner's OpenCode credentials. No model keys are stored in this repo.

Docs: `docs/ARCHITECTURE.md` · `docs/SWITCH_INTEGRATION.md` · `docs/MEMORY_ENGINE.md` · `docs/AGENT_ROLES.md` · `docs/API.md` · `docs/DEMO_GUIDE.md` · build ledger `PHASES.md`.
