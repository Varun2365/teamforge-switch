# TEAMFORGE — The Six Agents

All six are **always-on custom Switch agent clients** running inside the TEAMFORGE API. Every reply is produced by the AI brain (headless OpenCode with the TeamForge MCP server attached); the model retrieves context, writes memory and chooses tools itself. The deterministic engine is an offline fallback only. Shared laws: unaddressed humans go to the operations manager, specialists answer mentions/handoffs, every claim is grounded in tools, consequential actions become approvals, provenance or silence.

| Agent | Registered name | Voice | Tools it leans on |
|---|---|---|---|
| AI Operations Manager | `ops-manager-tf` | Warm chief-of-staff; the only agent that answers unaddressed humans | status/overdue/ownership/memory answers + delegation |
| Project Manager | `project-manager-tf` | Pragmatic, dates-first | `propose_task` `create_task` `get_project_health` `get_task_dependencies` `create_task_dependency` `get_overdue_tasks` |
| Knowledge & Memory | `knowledge-memory-tf` | Precise archivist with opinions | `search_organization_memory` `find_entity` `get_fact_history` `propose_memory_update` `correct_memory` |
| Communication & Coordination | `communication-tf` | Human, polite-pressure included | `request_status_update` `create_follow_up` `create_reminder` `record_decision` |
| Research & Strategy | `research-strategy-tf` | Skeptical analyst | `search_organization_memory` `get_organization_overview` (never fabricates sources) |
| Quality & Risk | `quality-risk-tf` | Says the uncomfortable thing early | `analyze_project_risks` `find_blocked_tasks` `get_affected_dependencies` `generate_project_health_report` |

## Collaboration protocol (the important part)

1. **Unaddressed human → operations manager.** No @mention required. This is the product's whole UX.
2. **Explicit @mention → exactly that agent.** One voice, never a chorus.
3. **Handoffs** use a `[TEAMFORGE_HANDOFF from=… to=…]` marker; only the recipient acts. Ops hands deep work to a specialist and returns one synthesized answer.
4. **Agent/system messages are never answered** — recorded, not reacted to (loop prevention verified live).
5. **Consequential actions become approvals** (`assign_task`, `propose_reassignment`, `propose_deadline_change`, `create_approval_request`); only humans approve.
6. **Memory writes are proposals**, auto-applied only at high confidence with a source; history is append-only.

## Humanized output — how it's enforced

- The voice rules are in the AI prompt (first names, contractions, short sentences, warm colleague tone, no tool talk, no invented org facts, one question when needed) plus the shared `deRoboticize()` post-pass applied to every reply.
- `switch/agent-instructions/*.md` remains the canonical voice/role specification and is kept in sync with behaviour.
- Scheduler copy (morning brief, overdue nudges) follows the same rules.

## Tuning the voice

1. Reply composition lives in `apps/api/src/integrations/switch/agent-brain.ts` (deterministic engine) — tune phrasing there.
2. Global tone rules: `packages/shared/src/humanize.ts` and `switch/agent-instructions/_voice.md`.
3. Role scoping/tool access: `apps/api/src/integrations/switch/catalog.ts`.

## Routing rules (how Ops picks specialists)

Deterministic intent mapping in `chooseAgent()` (research → Research, risk/blocked → Risk, planning/timeline → PM, follow-ups → Comms, memory questions → Knowledge), explicit mentions always win, and handoffs carry full instructions. If an agent isn't available, the runtime says so — it never invents a specialist's answer.

