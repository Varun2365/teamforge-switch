# Room design — why TEAMFORGE uses four rooms

| Room | Who | Purpose | Traffic profile |
| --- | --- | --- | --- |
| `teamforge-lobby` | Humans + `@operations-manager` | Natural conversation entry point. Asking, deciding, approving | Human ↔ one agent. Clean |
| `teamforge-agents` | Six agents only | Delegations, handoffs, specialist findings | Agent ↔ agent. Dense but contained |
| `teamforge-approvals` | Humans + `@operations-manager` | One card per consequential action (assign, deadline, external send, merge) | Burst traffic, decision-oriented |
| `teamforge-digest` | Humans + `@operations-manager` | Morning brief, reminders, overdue escalations | Scheduled, opt-out |

Design rules:

1. **Mess prevention is structural, not moderated.** Specialists are not members of the lobby — they cannot barge in. Ops synthesizes.
2. **Side-room pattern** (from Switch's own open-source-contribution scenario): agents do their arguing where humans don't have to read it. Humans can always open the side room to audit the reasoning.
3. **Approvals are first-class.** The human question "can we?" is never answered in passing; it lands in approvals with an id, an impact statement and an approve/reject path.
4. **The digest is lossy on purpose.** It is a nudge surface, never the record. Everything it references is in MongoDB/dashboard.

Switch's own room docs note that agents answer only when addressed (mention, alias, role, or targeted message). TEAMFORGE embraces that instead of pretending otherwise: talking to TEAMFORGE means addressing `@operations-manager` (or its alias `@ops`). No commands required, no keyword parsing — natural language in, addressed to one agent, who coordinates everyone else.

What TEAMFORGE does NOT support by design:

- Six agents free-responding to a message (noise + conflicting answers).
- Agents posting status unprompted into the lobby (digest room exists for that).
- Agents acting on consequential work without an approval card.
