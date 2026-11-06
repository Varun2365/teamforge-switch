# TEAMFORGE

**An AI operations teammate that remembers your team — built on [Switch](https://docs.switchagents.ai/).**

People talk normally in a Switch room (bridged to Discord). One AI operations manager understands the work, pulls from a temporal organizational memory, creates and tracks real tasks, coordinates specialists, and answers like a human colleague. Consequential changes wait for a human approval. Nothing is demo data: the organization is built from the conversation itself.

> Hackathon brief: *“Build a workflow where an AI agent and the people in a team chat get a real task done together.”* TEAMFORGE is that workflow: the team chats, the agent does the coordination work, Switch carries the collaboration.

---

## How Switch is used

Switch is the **room, the agents, the identities, the message bus and the collaboration layer** — not an integration bolted onto a chatbot.

```
Discord (#teamforge-lobby)  ◄──bridge──►  Switch server (:56565)
                                              ▲  always-on WebSocket per agent
                                              │  scope=all, filter=all
                                    TEAMFORGE API (:4100)
                                    ├─ six Switch agent clients
                                    ├─ routing: unaddressed → Operations Manager; mentions → one specialist
                                    ├─ AI brain (OpenCode / deepseek-v4.1-flash) + MCP tools
                                    ├─ approvals · memory · scheduler · audit
                                    └─ dashboard (:5183)
                                              │
                                        MongoDB (teamforge-ops)
```

### Agents connected (all real Switch agents)

| Switch name | Role | Answers |
|---|---|---|
| `ops-manager-tf` | AI Operations Manager | every unaddressed human message; coordinates |
| `project-manager-tf` | Project Manager | plans, tasks, dependencies, delivery health |
| `knowledge-memory-tf` | Knowledge & Memory | memory, people, decisions, history |
| `communication-tf` | Communication & Coordination | follow-ups, reminders, recaps |
| `research-strategy-tf` | Research & Strategy | evidence, options, recommendations |
| `quality-risk-tf` | Quality & Risk | blockers, dependencies, blast radius |

Registered automatically via the documented Agent Protocol (`POST /agents`) on boot, using `SWITCH_REGISTRATION_TOKEN`. They connect always-on; any human message with no @mention is answered by the Operations Manager only, so the room stays one voice. Specialist traffic is handled behind the scenes.

### Channel / room setup (automatic)

- On first boot, the runtime looks for the room **`teamforge-lobby`**; if it doesn't exist it **creates it through Switch on the connected Discord bridge**, which provisions a fresh Discord channel. No manual channel creation.
- All six agents are invited to the room; the room id and Discord channel id are stored in `room_mappings`.
- If channel creation isn't permitted on the bridge, the runtime falls back to an internal-only Switch room and says so in logs — never pretending a Discord channel exists.
- Configurable via `SWITCH_ROOM_NAME`, `SWITCH_INTERNAL_ONLY`, `SWITCH_BRIDGE_ID`.

### Message flow

1. Discord → Switch bridge → Switch room.
2. Six agent clients receive the room event; routing selects one responder.
3. The AI brain (headless OpenCode, model `deepseek-v4.1-flash`) reads a live org snapshot + recent conversation, calls **MCP tools** to read/write the organization, and writes a short reply.
4. The reply is posted back through Switch (targeted when the human addressed an agent, so mentions render).
5. Every tool call and reply is audited in `agent_actions` with the Switch agent's name.

### Proactive work (also through Switch)

A persistent scheduler (Mongo-backed) posts the morning brief, overdue scans with dependency impact, deadline follow-ups, commitment checks and reminders into the Switch room. Person-targeted reminders use Switch targeting so the teammate is @mentioned. All of it is controllable from the dashboard's **Queue** page (pause, cancel jobs, clean stuck messages).

### Optional: fully Switch-managed reasoning

By default the runtime calls the model locally (still using Switch for every message/identity/tool). To run the model inside a Switch Console-managed agent:

1. Create `teamforge-ai` in Switch Console → provider **OpenCode**, Directory `apps/api/brain`, invite it to the room.
2. Set `SWITCH_AI_RELAY=true` in `.env` and restart.
3. The backend then only forwards the message through Switch; the managed agent answers and uses MCP tools itself.

---

## Quickstart (clone → run)

**Prerequisites:** Node 20+ · MongoDB running locally (or `docker compose up -d mongo`) · Switch Console open with its local server and Discord connected.

```powershell
git clone <your-repo> teamforge
cd teamforge
npm install
npm run setup      # auto: .env + API key, detects Switch, checks Mongo, bootstraps org
npm run dev        # API + six Switch agents on :4100
npm run dev:web    # dashboard on :5183
```

`npm run setup` does everything it can automatically:
- creates `.env` with a strong API key,
- finds your local Switch server (reads `ports.json`, then common ports) and checks `/health`,
- verifies MongoDB,
- bootstraps the organization and recurring jobs (**no sample people/tasks**),
- writes the whole agent/room configuration.

**The one value it can't create for you:** a Switch **registration key** (admin-only credential). Setup opens the Gateway URL and asks for it once. Create it at `Gateway → API Keys → type “registration”` and paste it. After that, first boot registers all six agents and provisions the Discord channel automatically.

If you don't have a registration key yet, TEAMFORGE still runs: the dashboard, memory, tasks, approvals and scheduler work; agents stay offline and the runtime says so honestly.

### First conversation (no commands, no demo data)

In `#teamforge-lobby`, just talk:

```
Hi, I'm Sarah, founder of Acme Technologies. Alex is our project manager, Maya
is UI/UX, Rahul is backend, Priya is frontend, Emma is QA, Daniel is marketing.

We're launching our website on Nov 13. Maya: designs by Nov 8. Rahul:
authentication API by Nov 9. Priya: frontend integration by Nov 11. QA by Nov 12.
Daniel: launch campaign by Nov 12. Frontend depends on the API; QA depends on
frontend.
```

The AI creates the people, project, tasks, assignments, dependencies and memory — verified in the dashboard. Then ask anything:

- “Who is responsible for frontend?”
- “What is Rahul working on?”
- “Remind me tomorrow at 10 AM to review the launch plan.”
- “Rahul’s API is blocked by the payment provider — does that affect launch?”
- “What did we decide about pricing?”

---

## What you get

| Area | What it does |
|---|---|
| **Switch agents** | Six always-on agents, one shared room, no-mention routing, loop prevention |
| **AI brain** | Headless OpenCode (`deepseek-v4.1-flash`) with the live org snapshot + recent chat; decides tools and wording; no templates |
| **MCP tools** | ~55 business tools (org, memory, projects, tasks, approvals, reminders, risk, people) over `/mcp`, org-scoped and audited |
| **Temporal memory** | Entities, graph relationships, facts with valid-from/until, aliases, provenance, corrections preserve history |
| **Work management** | Projects, tasks, assignments, dependencies, milestones, commitments, decisions |
| **Approvals** | Agent-proposed assignments/deadlines/external sends wait for a human |
| **Proactive** | Persistent MongoDB scheduler, reminders, morning brief, overdue/blast-radius scans, quiet hours, daily caps |
| **Dashboard** | Overview, People, Org graph, Projects, Tasks (list + board), Scheduled, **Queue**, Memory, Approvals, Agents, Settings |
| **Safety** | Org isolation, audit logs, secrets never in git, honest errors |

---

## Ports & environment

| Port | Service |
|---|---|
| 4100 | TEAMFORGE API + `/mcp` + `/health` + `/openapi.json` |
| 5183 | Dashboard |
| 56565 | Switch agent bridge (inside Switch Console) |
| 56564 | Switch Gateway (admin) |
| 27017 | MongoDB |

Key variables (full list in `.env.example`):

| Variable | Purpose |
|---|---|
| `TEAMFORGE_API_KEY` | API/dashboard/auth (auto-generated by setup) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/teamforge-ops` |
| `SWITCH_SERVER_URL` | auto-detected Switch bridge |
| `SWITCH_REGISTRATION_TOKEN` | one-time admin credential for agent registration |
| `SWITCH_ROOM_NAME` | default `teamforge-lobby` |
| `SWITCH_AGENT_SUFFIX` | default `-tf` (keeps this build distinct from older agents) |
| `OPENCODE_MODEL` | `opencode-go/deepseek-v4.1-flash` |
| `OPENCODE_TIMEOUT_MS` | reply watchdog (default 90s; fallback keeps the room alive) |
| `SWITCH_AI_RELAY` | `true` to run reasoning inside a Switch-managed agent |
| `TEAMFORGE_DEMO_MODE` | `false` = proactive items post to the Switch room |

---

## Verification & testing

- `npm test` — 39 unit/integration tests (routing, temporal memory, approvals, scheduler, tools, voice).
- `npm run check:mcp` — MCP handshake + tools list/call.
- `npm run verify:switch` — Switch bridge health.
- `scripts/e2e.mjs` — end-to-end scenario runner (messages → AI → tools → DB → replies). Report in `E2E_REPORT.md`; regenerate with `node scripts/e2e-report.mjs`.
- `scripts/e2e-proactive.mjs` — proves a due reminder is delivered exactly once through Switch.

The live E2E run built Acme Technologies entirely from messages (8 people, 2 projects, 7 tasks, dependencies, skills, decisions, reminders) with tool-call evidence for every claim.

---

## Repo layout

```
apps/api/       Fastify + Mongoose engine, MCP tools, scheduler, Switch runtime, AI brain
apps/web/       React + Vite + Ant Design dashboard
apps/api/brain/ AGENTS.md prompt brief + generated opencode.json for MCP
packages/shared events, types, voice utilities
scripts/        setup, E2E suite/report, proactive check, Switch/MCP checks
docs/           architecture, Switch integration, memory, agents, API, demo guide
switch/         agent role/voice specifications
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agents offline | Switch Console must stay open; check `npm run verify:switch`; ensure the registration key is set |
| Not sure what's queued | Dashboard → **Queue**: pause proactive, cancel jobs, clean stuck messages |
| A flood of messages | An E2E run may still be going; stop it/clear the room, then Queue → Cancel all pending jobs |
| No reply in Discord | Check API (:4100) and the Agents page (6/6 online); check `apps/api/live.log` |
| Dashboard asks for a key | In dev it is injected from `.env`; otherwise paste `TEAMFORGE_API_KEY` in Settings |
| MongoDB missing | Start the service or `docker compose up -d mongo` |

**Honest notes:** Discord typing indicators exist only for Switch Console-managed sessions, not custom WebSocket agents; Switch Console must be running; the suite uses `deepseek-v4.1-flash` for cost; consequential agent actions are approval-gated by design.

---

Docs: [architecture](docs/ARCHITECTURE.md) · [Switch integration](docs/SWITCH_INTEGRATION.md) · [memory engine](docs/MEMORY_ENGINE.md) · [agents](docs/AGENT_ROLES.md) · [API](docs/API.md) · [demo guide](docs/DEMO_GUIDE.md) · build ledger [PHASES.md](PHASES.md).
