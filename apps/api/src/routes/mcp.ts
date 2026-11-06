import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildToolRegistry } from '../tools/index.js';
import { config } from '../config.js';
import { OrganizationModel } from '../db/models/org.js';

let cachedOrgId: string | null = null;
async function defaultOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const org = await OrganizationModel.findOne({ slug: config.ORG_SLUG }).lean();
  if (!org) throw new Error(`Organization '${config.ORG_SLUG}' not found — run \`npm run seed\` first.`);
  cachedOrgId = org._id;
  return cachedOrgId;
}

export async function mcpRoutes(app: FastifyInstance) {
  const registry = buildToolRegistry();

  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = await defaultOrgId();
    const agentHeader = req.headers['x-teamforge-agent-name'];
    const actorName = typeof agentHeader === 'string' && agentHeader.trim() ? agentHeader.trim() : 'switch-agent';

    const server = new McpServer({ name: 'teamforge', version: '1.0.0' });
    for (const tool of registry.describe()) {
      server.registerTool(
        tool.name,
        { description: `[${tool.tier}] ${tool.description}`, inputSchema: tool.inputSchema },
        async (args: Record<string, unknown>) => {
          const res = await registry.call({ orgId, actor: { type: 'agent', name: `agent:${actorName}` } }, tool.name, args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(res.ok ? res.result : res.error, null, 2) }],
            isError: !res.ok,
          };
        },
      );
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    const parsedBody = req.body as unknown;
    await transport.handleRequest(req.raw, reply.raw, parsedBody);
    reply.hijack();
    req.raw.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
  };

  app.route({ method: ['GET', 'POST', 'DELETE'], url: '/mcp', handler });
}
