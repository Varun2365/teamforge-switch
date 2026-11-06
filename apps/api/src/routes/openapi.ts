import type { FastifyInstance } from 'fastify';

const p = (name: string) => ({ tags: ['teamforge'], summary: name });

/** Compact OpenAPI 3.0 description of the REST surface. /mcp speaks the MCP Streamable HTTP protocol instead. */
const spec = {
  openapi: '3.0.3',
  info: { title: 'TEAMFORGE API', version: '1.0.0', description: 'Organizational intelligence backend for TEAMFORGE — org data, memory graph, projects, tasks, approvals, reminders. Authenticate with Authorization: Bearer <TEAMFORGE_API_KEY>. Agents use /mcp instead of these routes.' },
  servers: [{ url: 'http://127.0.0.1:4100' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': { get: { ...p('Health check (public)'), security: [] } },
    '/api/overview': { get: p('Dashboard overview aggregate') },
    '/api/organizations/current': { get: p('Current org profile') },
    '/api/departments': { get: p('List departments') },
    '/api/teams': { get: p('List teams') },
    '/api/people': { get: p('List people'), parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'departmentId', in: 'query', schema: { type: 'string' } }] },
    '/api/people/{id}': { get: p('Person profile'), patch: p('Update person (title/department/manager/location)') },
    '/api/memory/search': { get: p('Search organizational memory'), parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] },
    '/api/entities/{id}': { get: p('Entity detail + facts') },
    '/api/entities/{id}/relationships': { get: p('Entity relationships (both directions)') },
    '/api/entities/{id}/history': { get: p('Entity history: facts, versions, relationships, events') },
    '/api/facts/history': { get: p('Fact history for entity/predicate'), parameters: [{ name: 'entityId', in: 'query', required: true, schema: { type: 'string' } }, { name: 'predicate', in: 'query', schema: { type: 'string' } }] },
    '/api/memory/proposals': { get: p('List memory proposals'), post: p('Create memory proposal') },
    '/api/memory/proposals/{id}/approve': { post: p('Approve memory proposal (applies it)') },
    '/api/memory/proposals/{id}/reject': { post: p('Reject memory proposal') },
    '/api/memory/correct': { post: p('Correct a fact (history preserved)') },
    '/api/entities/merge': { post: p('Merge duplicate entities') },
    '/api/events': { get: p('List recorded events'), post: p('Record an event') },
    '/api/projects': { get: p('List/search projects'), post: p('Create project') },
    '/api/projects/{id}': { get: p('Project detail'), patch: p('Update project') },
    '/api/projects/{id}/timeline': { get: p('Project timeline') },
    '/api/projects/{id}/health': { get: p('Project health report') },
    '/api/tasks': { get: p('List/search tasks'), post: p('Create task') },
    '/api/tasks/overdue': { get: p('Overdue tasks') },
    '/api/tasks/{id}': { get: p('Task detail'), patch: p('Update task') },
    '/api/tasks/{id}/assign': { post: p('Assign task') },
    '/api/tasks/{id}/complete': { post: p('Complete task') },
    '/api/tasks/{id}/dependencies': { get: p('Task dependencies'), post: p('Add dependency') },
    '/api/risks': { get: p('Risk findings (all active projects, or one with ?projectId=)') },
    '/api/approvals': { get: p('List approvals'), parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }] },
    '/api/approvals/pending': { get: p('Pending approvals') },
    '/api/approvals/{id}/approve': { post: p('Approve (applies side effects for reassign/deadline_change)') },
    '/api/approvals/{id}/reject': { post: p('Reject') },
    '/api/reminders': { get: p('List reminders'), post: p('Create reminder') },
    '/api/reminders/{id}': { patch: p('Update/snooze reminder'), delete: p('Cancel reminder') },
    '/api/agent-actions': { get: p('Agent activity log'), parameters: [{ name: 'agent', in: 'query', schema: { type: 'string' } }] },
    '/api/notifications': { get: p('Notification feed (dashboard)') },
    '/api/scheduled-jobs': { get: p('Scheduled jobs (persistent scheduler state)') },
    '/api/switch/status': { get: p('Switch connection status for Settings') },
    '/api/tools': { get: p('Tool catalog (names, descriptions, tiers)') },
    '/api/tools/call': { post: p('Invoke a tool directly (debug)') },
  },
};

export async function openapiRoutes(app: FastifyInstance) {
  app.get('/openapi.json', async () => spec);
  app.get('/docs', async (_req, reply) => {
    reply.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><title>TEAMFORGE API</title>
<style>body{font-family:ui-sans-serif,system-ui;max-width:760px;margin:40px auto;padding:0 16px;color:#1c1c1e}code{background:#f0efec;padding:2px 6px;border-radius:4px}h1{font-size:22px}</style></head><body>
<h1>TEAMFORGE API</h1>
<p>Spec: <a href="/openapi.json"><code>/openapi.json</code></a> · MCP endpoint for Switch-managed agents: <code>/mcp</code> (Streamable HTTP, bearer auth, send <code>X-Teamforge-Agent-Name</code>).</p>
<p>Authenticate with <code>Authorization: Bearer $TEAMFORGE_API_KEY</code>. Full route list is in the spec; the dashboard uses these routes, agents use tools instead.</p>
</body></html>`);
  });
}
