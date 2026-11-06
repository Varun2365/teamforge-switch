# TEAMFORGE

**An AI teammate that keeps your team's work moving — inside your Switch chat.**

TEAMFORGE is an AI operations manager for a team. People just talk in Discord: it understands what's happening, remembers who does what, creates and tracks the actual tasks, and replies in short, human language. It also follows up by itself — reminders, deadlines, blockers — so nothing depends on someone chasing.

Everything runs through **Switch**: the six agents, the shared room, and every message. You don't need to learn a tool or type commands. You talk, and the work gets organized.

No demo data. No scripted answers. The organization is built from your real conversation.

> *"Who's handling QA, and what's it waiting on?"* → it checks the real board, names the owner and the blocker.
>
> *"Remind me tomorrow at 10 to review the launch plan."* → the reminder is saved and delivered in the room.
>
> *"The API is blocked by the payment provider."* → it records the blocker, traces the impact on launch, and suggests what to do.

---

## Contents

- [How Switch is used](#how-switch-is-used)
- [Quick start](#quick-start)
- [Your first conversation](#your-first-conversation)
- [The dashboard](#the-dashboard)
- [What's running under the hood](#whats-running-under-the-hood)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)

---

## How Switch is used

Switch is the **room, the agents, the identities and the message bus** — not an add-on.

```
Discord (#teamforge-lobby)  ⇄  Switch server (:56565)
                                    ▲   always-on WebSocket per agent
                                    │
                          TEAMFORGE API (:4100)
                          ├─ six Switch agents + routing
                          ├─ AI brain + MCP tools
                          ├─ approvals · memory · scheduler
                          └─ dashboard (:5183)
                                    │
                              MongoDB (teamforge-ops)
```

### The six agents

| Agent | Switch name | Responsibility |
|---|---|---|
| AI Operations Manager | `ops-manager-tf` | Answers every unaddressed message, coordinates, produces one human reply |
| Project Manager | `project-manager-tf` | Plans, tasks, dependencies, delivery health |
| Knowledge & Memory | `knowledge-memory-tf` | People, facts, decisions, history |
| Communication & Coordination | `communication-tf` | Follow-ups, reminders, recaps |
| Research & Strategy | `research-strategy-tf` | Evidence, options, recommendations |
| Quality & Risk | `quality-risk-tf` | Blockers, dependencies, blast radius |

They register themselves with Switch on first boot (documented Agent Protocol), connect always-on, and share one room. **Only the Operations Manager answers unaddressed messages**, so the room never turns into six bots talking at once. Specialists speak only when mentioned or handed work.

### The room (created for you)

On first boot TEAMFORGE looks for a room called **`teamforge-lobby`**. If it doesn't exist, it creates one through Switch on your connected Discord bridge — which provisions a fresh Discord channel — then invites all six agents. Room and channel ids are stored locally. If the bridge doesn't allow channel creation, it falls back to an internal Switch room and says so in the logs instead of pretending.

### A message, end to end

1. Someone types in Discord — no commands, no @mention needed.
2. Switch delivers the event to the six agents.
3. Routing picks one responder (humans → Operations Manager; @mentions → that specialist).
4. The AI reads a live snapshot of the organization, calls **MCP tools** to read or change real data, and writes a short, human answer.
5. The reply goes back through Switch into the room. Every tool call and reply is logged with the agent's Switch identity.

### Proactive, not just reactive

A persistent MongoDB scheduler posts the morning brief, overdue scans with dependency impact, deadline follow-ups and reminders through the same Switch room. Person-targeted reminders **@mention** the teammate via Switch targeting. Everything is visible and controllable on the **Queue** dashboard page (pause, cancel, clean up).

---

## Quick start

**Install these first (the repo can't install system software for you):**

| Requirement | Notes |
|---|---|
| **Node.js 20+** | `node -v` should work |
| **MongoDB** | running locally (`mongodb://127.0.0.1:27017`); the repo uses its own `teamforge-ops` database |
| **OpenCode CLI** | installed and signed in — this is the AI brain |
| **Switch Console** | open, local server running, Discord connected, your Discord account linked |

Then:

```bash
git clone <your-repo> teamforge
cd teamforge
npm install
npm run setup      # creates and fills .env for you
npm run dev        # API + six agents  → http://127.0.0.1:4100
npm run dev:web    # dashboard        → http://127.0.0.1:5183
```

**You never edit `.env` by hand.** `npm run setup` is idempotent and does all of this:

- creates `.env` from `.env.example` if it's missing,
- generates a strong `TEAMFORGE_API_KEY`,
- sets the database, ports, org, room name, model and timeouts,
- discovers your local Switch server (reads its `ports.json`, then common ports) and health-checks it,
- verifies MongoDB is reachable and OpenCode is on PATH,
- bootstraps the organization and recurring jobs (**no sample data**),
- asks for the **Switch registration key** once, if missing.

**The one value setup can't create** is the Switch registration key — it's an admin credential:

> Switch Gateway → **API Keys** → create a key of type **registration** → paste it when setup asks.

After that, the first `npm run dev` registers the six agents, connects them, creates the room **`teamforge-lobby`** (and its Discord channel via the bridge), invites the agents, and schedules the daily jobs. No further configuration.

If the registration key isn't available yet, the app still runs: dashboard, memory, tasks, approvals and scheduler work; agents stay offline and the runtime says so honestly.

Re-run `npm run setup` any time; it only fills in what's missing.

---

## Your first conversation

No seeding, no setup screens. Introduce the team and the work in the room:

```
Hi, I'm Sarah, founder of Acme Technologies.
Alex is our project manager, Maya is UI/UX, Rahul is backend,
Priya is frontend, Emma is QA, Daniel is marketing.

We're launching our website on Nov 13.
Maya: designs by Nov 8. Rahul: authentication API by Nov 9.
Priya: frontend integration by Nov 11 — it depends on the API.
Emma: QA by Nov 12. Daniel: launch campaign by Nov 12.
```

The AI creates the people, project, tasks, assignments, dependencies and memory — all visible on the dashboard. Then just ask:

- *“Who is responsible for frontend?”*
- *“What's Rahul working on?”*
- *“Remind me tomorrow at 10 to review the launch plan.”*
- *“The API is blocked by the payment provider — how does that affect launch?”*
- *“What did we decide about pricing?”*

---

## The dashboard

Open **http://127.0.0.1:5183**.

| Page | What it's for |
|---|---|
| **Overview** | The organization's pulse: projects, overdue work, approvals, decisions, agent activity |
| **People** | Profiles, skills, workload, reporting lines |
| **Org graph** | The living map of people, projects, tasks and decisions |
| **Projects / Tasks** | Real plans, dependencies, list and board views |
| **Scheduled** | Reminders and proactive jobs |
| **Queue** | Everything queued: pending jobs, active reminders, stuck messages — pause, cancel, clean up |
| **Memory** | Search facts, inspect sources and history, resolve proposals |
| **Approvals** | Anything consequential waiting on a human |
| **Agents** | Switch presence (6/6), tool calls, handoffs, errors |
| **Settings** | Organization, Switch status, API key |

---

## What's running under the hood

- **AI brain:** headless OpenCode with `deepseek-v4.1-flash`, given a live org snapshot and recent conversation. It decides what to retrieve, what to remember, which tools to call and how to reply. A safe fallback keeps the room alive if the model is unavailable — clearly logged, never silent.
- **Tools:** ~55 business tools over MCP (`/mcp`) and REST — org, people, memory, projects, tasks, coordination, scheduling, risk. Zod-validated, organization-scoped, audited.
- **Memory:** a temporal knowledge graph. Facts have validity windows, sources and confidence; updates supersede rather than overwrite, so "who led backend before?" is still answerable.
- **Approvals:** assigning people, moving deadlines, external sends and sensitive memory changes wait for a human.
- **Scheduler:** MongoDB-backed jobs with idempotent delivery, quiet hours and daily caps — no in-memory timers.

---

## Configuration

Everything lives in `.env` (created by setup). The important ones:

| Variable | Purpose | Default |
|---|---|---|
| `TEAMFORGE_API_KEY` | API/dashboard auth | generated |
| `MONGODB_URI` | MongoDB database | `mongodb://127.0.0.1:27017/teamforge-ops` |
| `SWITCH_SERVER_URL` | Switch bridge | auto-detected |
| `SWITCH_REGISTRATION_TOKEN` | one-time agent registration | — |
| `SWITCH_ROOM_NAME` | room / Discord channel | `teamforge-lobby` |
| `SWITCH_AGENT_SUFFIX` | keeps agents distinct | `-tf` |
| `OPENCODE_MODEL` | AI model | `opencode-go/deepseek-v4.1-flash` |
| `SWITCH_AI_RELAY` | run reasoning inside a Switch-managed agent | `false` |

Full list with comments: [`.env.example`](.env.example).

---

## Testing

```bash
npm test                 # 39 unit/integration tests
npm run check:mcp        # MCP handshake + tool call
npm run verify:switch    # Switch bridge health
node scripts/e2e.mjs     # end-to-end scenario suite (writes E2E_REPORT.md)
node scripts/e2e-report.mjs
```

The live suite builds an entire sample organization from messages, then verifies tasks, dependencies, memory, reminders and approvals directly in MongoDB — not from chat text.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agents offline | Keep Switch Console open; run `npm run verify:switch`; check the registration key |
| Flood of messages | An E2E run may still be going; open **Queue** → cancel pending jobs, clean stuck messages |
| No reply in Discord | Check the API (`:4100`) and the Agents page (should show 6/6 online); inspect `apps/api/live.log` |
| Dashboard asks for a key | It's auto-injected in dev; otherwise paste `TEAMFORGE_API_KEY` in Settings |
| MongoDB missing | Start the service, or `docker compose up -d mongo` |

**Honest limitations:** Discord typing indicators only exist for Switch Console-managed sessions, not custom WebSocket agents. Switch Console must be running for the bridge. The AI model runs locally through your OpenCode CLI; the optional relay mode moves it fully inside Switch.

---

## Project layout

```
apps/api/        Fastify + Mongoose: Switch runtime, AI brain, MCP tools, scheduler
apps/web/        React dashboard
apps/api/brain/  Agent brief + generated OpenCode/MCP config
packages/shared/ Events, types, voice utilities
scripts/         setup, E2E suite, Switch/MCP checks
docs/            Architecture, Switch integration, memory, agents, API, demo guide
```

More: [Architecture](docs/ARCHITECTURE.md) · [Switch integration](docs/SWITCH_INTEGRATION.md) · [Memory engine](docs/MEMORY_ENGINE.md) · [Agent roles](docs/AGENT_ROLES.md) · [API](docs/API.md) · [Demo guide](docs/DEMO_GUIDE.md) · [Build ledger](PHASES.md)

---

Built for the Switch hackathon. **Switch is the room; TEAMFORGE is the teammate.**
