# TEAMFORGE × Switch — how it runs (live)

This is the current, working integration. It follows the same architecture as the earlier build at `D:\WeMakeDevs`: **six custom, always-on Switch agent clients run inside the API process**, hear every message in the room, and decide who answers. No Switch Console agent sessions, no OpenCode per-agent sessions, no third-party LLM keys.

```
Discord channel  ──bridge──►  Switch server (:56565)  ◄──WebSocket(always_on, filter=all)──┐
       ▲                             │                                                     │
       │                             │ room = teamforge-lobby                             │
       └────────── posts ────────────┴─────────────────────────────────────────────────────┘
                                                                                           │
                                            six agent clients inside TEAMFORGE API (:4100)  ─┤
                                              • unaddressed human → operations-manager      │
                                              • @mention → that agent only                  │
                                              • agent/system messages → never answered      │
                                              • handoffs via TEAMFORGE_HANDOFF marker       │
                                              • tools = the live tool registry (Mongo-backed)
```

## What is already done (verified live on 2026-11-06)

- Six agents **registered on the server**: `ops-manager-tf`, `project-manager-tf`, `knowledge-memory-tf`, `communication-tf`, `research-strategy-tf`, `quality-risk-tf` (suffix `-tf` avoids colliding with the earlier build's agents).
- **6/6 connections online** (`GET /api/switch/status` → `runtime.onlineAgents: 6`).
- Room **`teamforge-lobby` created automatically on the Discord bridge** (external channel created by Switch — visible in your Discord server).
- A test message was posted into that channel by `ops-manager-tf` (HTTP 200).
- Loop prevention proven: an agent-authored message is classified `agent` and **not** answered.

## How to use it (this is the whole UX)

1. Keep **Switch Console** open (its local server powers the bridge) and keep the TEAMFORGE API running (`npm run dev`).
2. Open your Discord server → channel **`teamforge-lobby`**.
3. Type like a human — **no @mention needed**:

   | You type | Who answers |
   |---|---|
   | `what's slipping on the launch?` | `ops-manager-tf` — grounded in the task board, names the overdue API task and who's blocked |
   | `status update` | `ops-manager-tf` — counts + overdue + in-flight + approvals |
   | `who knows TypeScript?` | `ops-manager-tf` — from confirmed skills |
   | `what did we decide about pricing?` | `ops-manager-tf` — decision + date + who |
   | `@quality-risk-tf what breaks if the API slips?` | only `quality-risk-tf` — explicit routing |
   | `remind Aarav tomorrow at 10am to post the API ETA` | `ops-manager-tf` → creates a reminder (scheduler delivers it) |
   | `we should have the beta ready before the investor meeting next Thursday` | `ops-manager-tf` → notes the commitment/event and offers a follow-up |

4. Specialists are also in the room but **stay silent unless mentioned** — the operations manager can hand work over internally (`TEAMFORGE_HANDOFF`), and you'll see the specialist's answer in the same channel.

## Setup checklist (only needed on a fresh machine)

1. **Switch Console running**, local server healthy: `GET http://127.0.0.1:56565/health` → `{"status":"ok"}`.
2. A **registration key** (Gateway → API Keys → type `registration`) in `.env` as `SWITCH_REGISTRATION_TOKEN`.
3. (Optional) gateway admin email/password in `.env` so the runtime can open agent addressing automatically.
4. `npm run seed` once, then `npm run dev`. On boot you should see:
   `[teamforge] Switch runtime: 6/6 agents online · room <uuid>`
5. Check `http://127.0.0.1:4100/api/switch/status` (with the API key): `live: true`, `onlineAgents: 6`, `roomId`, and per-agent `connected: true`.

## Configuration that matters

| Variable | Meaning | Default |
|---|---|---|
| `SWITCH_REGISTRATION_TOKEN` | one-time registration credential | — |
| `SWITCH_ROOM_NAME` | room + Discord channel name | `teamforge-lobby` |
| `SWITCH_INTERNAL_ONLY` | `false` = bridged room; `true` = agent-only | `false` |
| `SWITCH_AGENT_SUFFIX` | keeps names unique per build | `-tf` |
| `SWITCH_AUTO_PROVISION` | create/find the room on boot | `true` |
| `SWITCH_CREDENTIALS_PATH` | agent API keys on disk (0600, gitignored) | `data/switch-credentials.json` |
| `TEAMFORGE_DEMO_MODE` | `false` lets proactive items post into the room | `false` |

## Notes & limits (honest)

- **Addressing**: humans don't need to @mention. Explicit @mentions route to one agent. Switch's addressing policy still governs who may *address* an agent; the runtime opens that policy when gateway credentials are provided.
- **Switch Console must stay open** on this machine — closing it stops the bridge and the agents reconnect when it returns.
- **One voice**: unaddressed traffic goes to `ops-manager-tf`. Specialists only answer mentions or handoffs, so the room stays clean.
- **Re-registration**: deleting `data/switch-credentials.json` re-registers the six agents on next boot (the old keys become invalid).
- **Discord permissions**: the channel is created by Switch through the existing Discord bridge; members who should see it need access per your server's channel permissions.
- **No third-party model calls.** The reasoning engine is deterministic and tool-grounded. An optional LLM provider can be added later behind the same brain interface; it is explicitly not required.
