import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { createAuthHook } from './plugins/auth.js';
import { coreRoutes } from './routes/core.js';
import { memoryRoutes } from './routes/memory.js';
import { opsRoutes } from './routes/ops.js';
import { governanceRoutes } from './routes/governance.js';
import { toolRoutes } from './routes/tools.js';
import { mcpRoutes } from './routes/mcp.js';
import { openapiRoutes } from './routes/openapi.js';
import { queueRoutes } from './routes/queue.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  await app.register(cors, { origin: [config.WEB_ORIGIN, 'http://127.0.0.1:5183', 'http://localhost:5183'], credentials: false });
  app.addHook('onRequest', createAuthHook());

  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    reply.code(status).send({ error: { code: status >= 500 ? 'internal_error' : 'request_error', message: status >= 500 ? 'Something went wrong on our side.' : e.message ?? 'Bad request' } });
    if (status >= 500) console.error(err);
  });

  await app.register(coreRoutes);
  await app.register(memoryRoutes);
  await app.register(opsRoutes);
  await app.register(governanceRoutes);
  await app.register(toolRoutes);
  await app.register(mcpRoutes);
  await app.register(queueRoutes);
  await app.register(openapiRoutes);

  return app;
}
