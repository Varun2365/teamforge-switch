# TEAMFORGE × Switch — integration document

_Updated 2026-11-06 after live verification against the local Switch server (0.31.0)._

## 1. Decision: six always-on custom Switch agents inside the API

TEAMFORGE runs its agents as **custom Switch agent clients** (the Agent Protocol), not as Switch Console-managed provider sessions. This mirrors the earlier `D:\WeMakeDevs` build and is the only architecture that delivers the product behaviour people expect:

- **No mention required.** Switch's own managed-agent sessions start on address; custom clients connect with `scope=all, filter=all`, receive every room message, and route internally. Unaddressed human messages go to the operations manager.
- **No third-party model provider.** The brain is a deterministic, tool-grounded reasoning engine calling the same 53 business tools as the dashboard. (An LLM can be layered later behind the same interface; nothing here needs one.)
- **One voice.** Only the operations manager answers unaddressed traffic; specialists answer explicit @mentions or `TEAMFORGE_HANDOFF` delegations. Agent and system messages are recorded and never answered — loop prevention by construction.
- **Flat operational surface.** Everything is registered on boot from one `.env`: one registration key, six identities, one room, auto-provisioned on the Discord bridge.

```
Discord (#teamforge-lobby)
   │ bridge
   ▼
Switch server :56565  ←─ WebSocket per agent (always_on, scope=all, filter=all)
   ▲                         │
   │                         ▼
   └──── agent posts ◄── TEAMFORGE API :4100
                          ├ six agent clients + routing (routing.ts)
                          ├ deterministic grounded brain (agent-brain.ts)
                          ├ tool registry (Zod → Mongo-backed services)
                          ├ approvals + temporal memory + scheduler
                          └ REST + dashboard (:5183)
```

## 2. Agent identities

Registered automatically via `POST /agents` with `SWITCH_REGISTRATION_TOKEN`:

| Agent key | Switch name (suffix `-tf`) | Role |
|---|---|---|
| operations-manager | `ops-manager-tf` | human entry point, coordinator, grounded answers |
| project-manager | `project-manager-tf` | plans, tasks, dependencies, delivery health |
| knowledge-memory | `knowledge-memory-tf` | temporal memory, identity resolution, decisions |
| communication | `communication-tf` | follow-ups, reminders, recaps |
| research-strategy | `research-strategy-tf` | evidence, options, recommendations |
| quality-risk | `quality-risk-tf` | overdue/blocked risk, blast radius |

`connection_model: always_on`; credentials persisted to `data/switch-credentials.json` (0600, gitignored). A different `SWITCH_AGENT_SUFFIX` keeps TEAMFORGE disjoint from any other build on the same server.

## 3. Message lifecycle (as implemented)

1. WebSocket frame `{event:"message", data:{room_id, payload:{…}, sequence}}` arrives per agent.
2. Frames are queued per room per agent (ordering preserved).
3. Sender kind: `agent` when `sender_kind=agent` or the sender name matches a registered agent (suffix-aware); `system` for platform; otherwise `human`.
4. The message is persisted once (`messages`, unique on `orgId+switchMessageId`) with a `sources` row (provenance), conversation participants and addressed targets.
5. **Routing** (`routing.ts`, pure + unit-tested):
   - handoff marker addressed to me → I answer it;
   - non-human sender → ignore (persisted, unprocessed);
   - explicit mentions → only mentioned agents;
   - addressed without a mention → every agent may answer (Switch only marks addressed when someone meant it);
   - unaddressed human → operations-manager.
6. Atomic claim (`isProcessed:false → processing`) ensures exactly one agent replies even with six listeners racing.
7. The agent's brain executes up to 6 whitelisted tools scoped to its role, then composes the reply.
8. Reply is posted with `post_message` (targeted to the sender when they addressed the agent). Errors are surfaced in the room, not swallowed.
9. `agent_actions` records the tool calls, the reply, duration, handoff targets and errors.

## 4. Live verification (2026-11-06)

| Check | Result |
|---|---|
| `GET :56565/health` | `{"status":"ok"}` (Switch Console 0.31.0 local server) |
| Registration | all six agents created; actions logged `registered` |
| WebSocket | `connection_state` received, protocol 9, ping/pong answers; `subscription_changed` on room claims |
| Presence | `6/6 agents online` |
| Bridge discovery | one active **Discord** bridge, `can_create_channels: true` |
| Room provisioning | `teamforge-lobby` created; external Discord channel id `1568227780993351701` |
| Agent post | `POST /agents/{id}/message` → `{"ok":true,"event_id":…}` |
| Loop prevention | agent-authored message classified `agent`, not answered (verified) |
| Tests | 39/39 across 6 files (routing, handoff, brain grounding, memory, scheduler, tools) |

## 5. Legal API surface used (verified against the live operations registry)

- `POST /agents` (registration: requires `tools[].description`)
- `GET /agents/{id}/ops` (operation schemas; used to correct our create_room/post_message contracts)
- `POST /agents/{id}/ops/{op}` with `X-Switch-Connection-Id` for connection-bound ops
- Ops used: `list_rooms`, `create_room` (snake_case args + `bridge_id`/`channel_type`), `get_room_detail`, `list_participants`, `invite_agent_to_room`, `connect_to_room`, `post_message` (`body`), `send_targeted_message` (`body`,`target_names`), `list_bridges`
- WebSocket `/agents/{id}/connection/ws?connection_id&scope=all&filter=all&start_from&expected_generation`; `pong` with cursor; `connection_state`/`subscription_changed`/`evicted` handled
- `POST /agents/{id}/message` for out-of-band posts (proactive delivery)
- Gateway `POST /gateway/auth/login` + `PUT /gateway/agents/{id}/addressing-policy` when admin creds are configured

## 6. Proactive delivery

The scheduler now posts through the same agent runtime (`deliverProactive` → ops agent → room). No bridge key workaround needed. If the runtime is offline or the agent cannot post, the notification is stored on the dashboard and labelled — never faked as posted.

## 7. Known limits

- Switch Console must stay open on this machine; closing it stops the bridge (the runtime reconnects automatically when it returns).
- The brain is deterministic. It answers grounded business questions excellently (status, overdue, ownership, decisions, skills, reminders, risks) but cannot produce free-form research essays; that's an explicit product choice, not a missing integration. An optional LLM backend is documented as future work.
- Discord channel visibility follows the guild's permissions; Switch creates the channel, humans still need access per server settings.
- `SWITCH_GATEWAY_*` is optional; without it, addressing policy stays at the server default.
- Re-registering (deleting the credential file, or changing the suffix) creates new agent identities; old ones should be removed in the Gateway to avoid clutter.
