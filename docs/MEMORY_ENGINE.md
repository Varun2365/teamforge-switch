# TEAMFORGE — Organizational Memory Engine

The memory engine is the difference between TEAMFORGE and a chatbot with a database. It stores a **structured, temporal, sourced, entity-resolved model of the organization** — and it is genuinely usable from the agents today (every tool call audited).

## Model

```
entities ──< facts (temporal!)          relationships ── entity↔entity (typed, temporal)
   │              │                         │
   │        memory_versions (audit)         ├─ validFrom / validUntil / status(active|superseded|disputed)
   │              │                         └─ provenance: sourceId, confidence
   ├─ aliases (Aaru → Aarav Sharma)         
   ├─ sources (discord_message / switch_room / meeting / document / seed / manual)
   └─ memory_proposals (pending → approved/rejected; auto-apply only at ≥0.85 conf with source)
```

## Temporal semantics (no silent overwrites)

Every fact carries `validFrom`, `validUntil`, `recordedAt`, `confidence`, `sourceId`, `status`, `visibilityScope`.

- A **confident, sourced** update **supersedes**: the old fact closes (`validUntil`, `status: superseded`, `supersededByFactId`), the new one opens, and both stay retrievable forever (`get_fact_history`, `get_entity_history`, `/api/facts/history`).
- A **shaky** update (`confidence < 0.5`) is recorded as **disputed** and a `memory_proposal` is raised for a human — the prior fact stays active until a human resolves it.
- Sensitive predicates (`reports_to`, compensation, access, termination, ownership-of-budget) always require approval regardless of confidence.
- Correction is a supersession via `correct_memory` — never a delete. Merging duplicates (`merge_entities`) moves facts/relationships/aliases and marks the loser `merged` (history preserved).

**Worked example — "Who handled backend before Priya?"**

```
Mon:  fact responsible_for=backend → aarav (validFrom Mon, active)
Wed:  fact responsible_for=backend → priya (validFrom Wed, active; aarav's → superseded, validUntil Wed)
Query today: active answer = priya. History shows aarav Mon→Wed, with sources.
```

## Entity resolution

1. Normalize (case/diacritics/punctuation).
2. Exact canonical match → resolved.
3. Alias match (`aliases` collection, confidence-scored) → resolved via alias.
4. Fuzzy over bounded candidates (edit distance + token overlap):
   - score ≥ 0.86 and clear margin → resolved
   - otherwise → **ambiguous** (agent asks ONE question; never guesses)
   - nothing → no_match

Aliases are minted from explicit statements ("Aaru" → Aarav Sharma) with a confidence, and merged into the graph at seed/setup.

## Retrieval (what agents actually use)

- `search_organization_memory` — entities + facts + relationships for a query (regex-scored today; embedding provider can slot in later behind the same tool)
- `find_entity` — identity resolution on demand
- `get_entity_relationships` · `get_entity_history` · `get_fact_history` — the temporal spine
- `get_entity` — raw entity detail

## Ingestion (how messages become memory)

Understanding lives **in the Switch-managed agents**, not in regex: every agent (especially Knowledge & Memory) calls `propose_memory_update` when it notices a durable fact, `record_decision` for decisions, `record_event` for notable occurrences, and `record_handoff` for agent→agent transfers. The backend validates, scopes, versions, audits — and gates sensitive mutations through approvals. Unsourced claims cannot become facts (a sourceId is required, or `allowSystem` for seed migrations).

## Contradictions

- Confident update → supersedes (routine, no drama).
- Shaky update → disputed + proposal; both versions kept.
- A human resolves in **Memory page → Proposals**: approve applies with full history; reject rejects.

## Provenance

Every fact/relationship/event traces to `sources`: type (`discord_message`, `switch_room`, `meeting`, …), ref (message/meeting/doc id), author, short excerpt, captured time. "Where did we read that?" is always answerable — including "the seed".

## Your weekly touchpoints

1. Disputed facts (dashboard → Memory).
2. Pending proposals (dashboard → Memory, and Approvals for assignments/deadlines).
3. Entity duplicates (propose merge → approve).
4. History sanity: ask the agent "who did X before?" and check the answer against `get_fact_history`.
