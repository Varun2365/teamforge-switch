import type { FastifyInstance } from 'fastify';
import { buildToolRegistry } from '../tools/index.js';

export async function toolRoutes(app: FastifyInstance) {
  const registry = buildToolRegistry();

  app.get('/api/tools', async () => ({
    count: registry.list().length,
    note: 'Tools are also exposed over MCP at /mcp (Streamable HTTP) for Switch-managed agents.',
    tools: registry.list(),
  }));

  app.post('/api/tools/call', async (req, reply) => {
    const body = req.body as { name?: string; arguments?: unknown };
    if (!body?.name) return reply.code(400).send({ error: { code: 'bad_request', message: 'name is required' } });
    const res = await registry.call(req.auth, body.name, body.arguments ?? {});
    if (!res.ok) return reply.code(res.error.code === 'invalid_arguments' ? 400 : 422).send({ error: res.error });
    return { result: res.result };
  });
}
