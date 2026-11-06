# TEAMFORGE API

Base URL: `http://127.0.0.1:4100`
Interactive docs: `/docs` (HTML) · Spec: `/openapi.json`

## Auth

```
Authorization: Bearer $TEAMFORGE_API_KEY
```
Same key for dashboard + agents + scripts. Agents additionally send `X-Teamforge-Agent-Name: <agent>` so mutations are attributed in `agent_actions`. Humans in the dashboard are org-owner scope; soon-to-come per-user sessions are tracked in PHASES.md.

Wrong/missing key → `401 {"error":{"code":"unauthorized","message":"…"}}`

## The 40-second tour (curl)

```powershell
$key = "…"   # from .env
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4100/api/overview -H "Authorization: Bearer $key"
curl "http://127.0.0.1:4100/api/memory/search?q=pricing" -H "Authorization: Bearer $key"
curl http://127.0.0.1:4100/api/tasks/overdue -H "Authorization: Bearer $key"
curl http://127.0.0.1:4100/api/approvals/pending -H "Authorization: Bearer $key"
```

## Error shape

```json
{ "error": { "code": "invalid_arguments|unauthorized|not_found|conflict|internal_error", "message": "…", "details": { } } }
```

## Endpoint map

### System
`GET /health` (public) · `GET /openapi.json` · `GET /docs` · `GET /api/switch/status`

### Core & org
`GET /api/overview` — dashboard aggregate
`GET /api/graph` — nodes/edges for the org graph
`GET /api/organizations/current` · `GET /api/departments` · `GET /api/teams`
`GET /api/people` · `GET /api/people/:id` · `PATCH /api/people/:id`

### Memory
`GET /api/memory/search?q=…` · `GET /api/entities/:id` · `GET /api/entities/:id/relationships` · `GET /api/entities/:id/history`
`GET /api/facts/history?entityId=…&predicate=…` · `GET /api/memory/proposals[?status=]` · `POST /api/memory/proposals`
`POST /api/memory/proposals/:id/approve|reject` · `POST /api/memory/correct` · `POST /api/entities/merge`
`GET /api/events[?kind=]` · `POST /api/events` · `GET /api/memory/versions?factId=…`

### Projects & tasks
`GET|POST /api/projects` · `GET|PATCH /api/projects/:id` · `GET /api/projects/:id/timeline` · `GET /api/projects/:id/health`
`GET|POST /api/tasks` · `GET|PATCH /api/tasks/:id` · `GET /api/tasks/overdue`
`POST /api/tasks/:id/assign|complete` · `GET|POST /api/tasks/:id/dependencies`
`GET /api/risks[?projectId=]`

### Governance & proactive
`GET /api/approvals` · `GET /api/approvals/pending` · `POST /api/approvals/:id/approve|reject`
`GET|POST /api/reminders` · `PATCH|DELETE /api/reminders/:id`
`GET /api/agent-actions[?agent=]` · `GET /api/notifications[?status=&kind=]` · `GET /api/scheduled-jobs`

### Tools (debug surface)
`GET /api/tools` — catalog · `POST /api/tools/call` `{ "name": "…", "arguments": {…} }`

## MCP (agents use this, not REST)

`POST /mcp` — Streamable HTTP, same API key, stateless. Discover tools:

```
node scripts/check-mcp.mjs                 # initialize + tools/list
node scripts/check-mcp.mjs get_overdue_tasks '{}'
```

Every MCP tool call is Zod-validated, org-scoped, tier-checked (read/write/sensitive), and audited to `agent_actions` with the caller's name from `X-Teamforge-Agent-Name`.

## Notes

- Rate limiting: not yet enforced (single-org local deployment); behind the dashboard proxy in dev. Track in PHASES.md.
- All ids are UUID strings, not ObjectIds.
- Dates are ISO-8601 strings over JSON; `dueDate` is inclusive end-of-day semantics in the UI.
