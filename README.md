# TEAMFORGE

**The AI operations manager for real teams — inside Discord, through Switch.**

TEAMFORGE turns everyday team conversation into organized work. People just talk in Discord: it understands what's happening, remembers who does what, creates and tracks the real tasks, and replies in short, human language. It also does the work — writes updates, produces PDF reports — and messages you first when a deadline, blocker or commitment needs attention.

Everything runs through **Switch**: the six agents, the shared room, the identities, and every message, mention, attachment and typing indicator. You don't need to learn a tool or type commands. You talk, and the work gets organized.

No demo data. No scripted answers. The organization is built from your real conversation.

> *"Who's handling QA, and what's it waiting on?"* → it checks the real board, names the owner and the blocker.
>
> *"Remind me in 30 seconds to send the launch deck."* → the reminder is saved, then delivered in the room with an @mention.
>
> *"The API is blocked by the payment provider."* → it marks the task blocked, logs why, and traces the impact on launch.
>
> *"Create a project status report PDF and send it here."* → a real PDF is attached in Discord.

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
                          ├─ documents · typing · media
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

If the Discord channel is deleted later, Switch doesn't always report it. **Queue → Recreate Discord channel** creates a fresh Switch room and Discord channel, moves all six agents, updates the mapping, and archives the old room.

### A message, end to end

1. Someone types in Discord — no commands, no @mention needed.
2. Switch delivers the event to the six agents.
3. Routing picks one responder (humans → Operations Manager; @mentions → that specialist).
4. The Operations Manager first tries a **live-data fast path**: status, ownership, blockers, deadlines, reminders and PDF requests are handled straight from MongoDB — often in under a second. Anything that needs judgement goes to the AI.
5. The AI reads a live snapshot of the organization, calls **MCP tools** to read or change real data, and writes a short, human answer.
6. The reply goes back through Switch into the room. Switch shows the agent typing while it works, then delivers the reply and any attachment. Every tool call and reply is logged with the agent's Switch identity.

### Real work, not just chat

The agents don't only talk. They create tasks and dependencies, record decisions and blockers, schedule reminders, request approvals — and they can **produce documents**:

- *“Create a project status report PDF for Website Launch and send it here.”*
- *“Make a one-pager on where the launch stands.”*

TEAMFORGE builds a real PDF from the live project record (status, owners, dates, risks) and uploads it to the room as a **real Discord attachment** through Switch's media endpoint — not a link to a mock file. The report is generated deterministically, so it works even when the model is busy. Typing indicators, @mentions and file uploads are native Switch features, not screenshots.

### Fast by design

- Factual questions — status, ownership, blockers, deadlines, reminders — are answered from the live database in **~100 ms**, with no model round-trip.
- PDF reports are generated and uploaded in about a second.
- Model calls are serialized and fail fast. A busy provider can't trigger six agents at once or stall the room for 90 seconds.

### Proactive, not just reactive

A persistent MongoDB scheduler posts the morning brief, overdue scans with dependency impact, deadline follow-ups, commitment checks, stale-task checks and reminders through the same Switch room. The Operations Manager posts them in one consistent voice, and person-targeted reminders **@mention** the owner through Switch targeting. Relative times work too: *“in 30 seconds”*, *“tomorrow at 10”*, *“Friday at 9”*. Everything is visible and controllable on the **Queue** page: pause, cancel, clean up, and recreate the Discord channel.

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
- *“Who knows React?”*
- *“What's Rahul working on?”*
- *“Remind me in 30 seconds to review the launch plan.”*
- *“The API is blocked by the payment provider — how does that affect launch?”*
- *“What did we decide about pricing?”*
- *“Create a project status report PDF and send it here.”*

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
| **Queue** | Everything queued: pending jobs, active reminders, stuck messages — pause, cancel, clean up, recreate the Discord channel |
| **Memory** | Search facts, inspect sources and history, resolve proposals |
| **Approvals** | Anything consequential waiting on a human |
| **Agents** | Switch presence (6/6), tool calls, handoffs, errors |
| **Settings** | Organization, Switch status, API key |

---

## What's running under the hood

- **AI brain:** headless OpenCode with `deepseek-v4.1-flash`, given a live org snapshot and recent conversation. It decides what to retrieve, what to remember, which tools to call and how to reply. Model calls are serialized, fail fast on upstream limits and are capped by `OPENCODE_TIMEOUT_MS` (45s by default). A deterministic fast path answers common factual questions in milliseconds; a safe fallback keeps the room alive if the model is unavailable — clearly logged, never silent.
- **Tools:** 58 business tools over MCP (`/mcp`) and REST — org, people, memory, projects, tasks, coordination, scheduling, risk, and PDF reports. Zod-validated, organization-scoped, audited.
- **Documents:** PDFs are generated from the live project record with `pdfkit`, served at `/files/:name`, and uploaded into the room through Switch's media endpoint so Discord shows a real attachment.
- **Memory:** a temporal knowledge graph. Facts have validity windows, sources and confidence; updates supersede rather than overwrite, so "who led backend before?" is still answerable.
- **Approvals:** assigning people, moving deadlines, external sends and sensitive memory changes wait for a human.
- **Scheduler:** MongoDB-backed jobs with idempotent delivery, quiet hours and daily caps — no in-memory timers. Proactive posts go out as the Operations Manager, with @mentions for the person who owns the follow-up.

---

## Configuration

Everything lives in `.env` (created by setup). The important ones:

| Variable | Purpose | Default |
|---|---|---|
| `TEAMFORGE_API_KEY` | API/dashboard auth | generated |
| `MONGODB_URI` | MongoDB database | `mongodb://127.0.0.1:27017/teamforge-ops` |
| `PUBLIC_BASE_URL` | base URL used in generated file links | derived from `PORT` |
| `SWITCH_SERVER_URL` | Switch bridge | auto-detected |
| `SWITCH_REGISTRATION_TOKEN` | one-time agent registration | — |
| `SWITCH_ROOM_NAME` | room / Discord channel | `teamforge-lobby` |
| `SWITCH_AGENT_SUFFIX` | keeps agents distinct | `-tf` |
| `OPENCODE_MODEL` | AI model | `opencode-go/deepseek-v4.1-flash` |
| `OPENCODE_TIMEOUT_MS` | max time for one model call | `45000` |
| `SWITCH_TYPING_INDICATOR` | native Discord typing indicator | `true` |
| `SWITCH_ROOM_HEALTHCHECK` | probe the room channel and repair it | `true` |
| `SWITCH_AI_RELAY` | run reasoning inside a Switch-managed agent | `false` |

Full list with comments: [`.env.example`](.env.example).

---

## Testing

```bash
npm test                 # 39 unit/integration tests
npm run check:mcp        # MCP handshake + tool call
npm run verify:switch    # Switch bridge health
node scripts/e2e.mjs     # end-to-end scenario suite (writes E2E_REPORT.md)
node scripts/e2e-proactive.mjs
node scripts/e2e-report.mjs
```

The live suite builds an entire sample organization from messages, then verifies tasks, dependencies, memory, reminders and approvals directly in MongoDB — not from chat text.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agents offline | Keep Switch Console open; run `npm run verify:switch`; check the registration key |
| Flood of messages | An E2E run may still be going; open **Queue** → cancel pending jobs, clean stuck messages |
| No reply in Discord | Check the API (`:4100`) and the Agents page (should show 6/6 online); inspect `apps/api/live.log`. Factual questions answer instantly; open-ended ones use the model and fail over after 45s |
| Discord channel deleted | **Queue → Recreate Discord channel** — creates a fresh room and channel, moves all six agents, archives the old one |
| Dashboard asks for a key | It's auto-injected in dev; otherwise paste `TEAMFORGE_API_KEY` in Settings |
| MongoDB missing | Start the service, or `docker compose up -d mongo` |

**Honest limitations:** Switch Console must stay open — it hosts the local Switch server and the Discord bridge. Switch does not reliably report a deleted Discord channel, which is why the Queue action exists. The AI model runs locally through your OpenCode CLI; when it's unavailable, the deterministic fast paths and fallback keep the room answering, and the failure is logged.

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
