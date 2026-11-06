import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { OrganizationModel } from '../db/models/org.js';
import { config } from '../config.js';

const sha = (s: string) => createHash('sha256').update(s).digest();
const keyDigest = sha(config.TEAMFORGE_API_KEY);

export interface RequestAuth {
  orgId: string;
  actor: { type: 'user' | 'agent' | 'system'; id?: string; name: string };
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth;
  }
}

/** Public paths that skip bearer auth (health, spec, docs, CORS preflight). /mcp authenticates with the same key. */
const PUBLIC = ['/health', '/openapi.json', '/docs', '/favicon.ico'];

/**
 * Root-scoped onRequest hook. Register with `app.addHook('onRequest', createAuthHook())`
 * BEFORE any routes — child route contexts inherit it (unlike hooks inside a sibling plugin).
 */
export function createAuthHook() {
  let cachedOrgId: string | null = null;
  const resolveOrgId = async (): Promise<string> => {
    if (cachedOrgId) return cachedOrgId;
    const org = await OrganizationModel.findOne({ slug: config.ORG_SLUG }).lean();
    if (!org) throw new Error(`Organization '${config.ORG_SLUG}' not found — run \`npm run seed\` first.`);
    cachedOrgId = org._id;
    return cachedOrgId;
  };

  return async function onRequest(req: FastifyRequest, reply: FastifyReply) {
    if (req.method === 'OPTIONS') return;
    const url = req.url.split('?')[0]!;
    if (PUBLIC.includes(url)) return;

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const ok = token.length > 0 && timingSafeEqual(sha(token), keyDigest);
    if (!ok) {
      reply.code(401).send({ error: { code: 'unauthorized', message: 'Missing or invalid API key. Set TEAMFORGE_API_KEY and send Authorization: Bearer <key>.' } });
      return;
    }
    const orgId = await resolveOrgId();
    const agentHeader = typeof req.headers['x-teamforge-agent-name'] === 'string' ? req.headers['x-teamforge-agent-name'] : undefined;
    const userId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : undefined;
    const userName = typeof req.headers['x-user-name'] === 'string' ? req.headers['x-user-name'] : undefined;
    req.auth = {
      orgId,
      actor: agentHeader
        ? { type: 'agent', name: `agent:${agentHeader}` }
        : userId
          ? { type: 'user', id: userId, name: userName ?? 'dashboard user' }
          : { type: 'user', name: 'api-key (org owner scope)' },
    };
  };
}
