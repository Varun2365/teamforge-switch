import { config } from './config.js';
import { connectDb, disconnectDb } from './db/connection.js';
import { buildApp } from './app.js';
import { startScheduler } from './workers/scheduler.js';
import { startSwitchRuntime, stopSwitchRuntime } from './integrations/switch/runtime.js';
import { OrganizationModel } from './db/models/org.js';

async function main() {
  await connectDb();
  const app = await buildApp();
  const stopScheduler = startScheduler();
  await app.listen({ port: config.PORT, host: '127.0.0.1' });
  console.log(`[teamforge] API on http://127.0.0.1:${config.PORT} · dashboard origin ${config.WEB_ORIGIN} · org ${config.ORG_SLUG}`);

  const org = await OrganizationModel.findOne({ slug: config.ORG_SLUG }).lean();
  if (org) {
    void startSwitchRuntime(org._id)
      .then((runtime) => {
        const status = runtime.getStatus();
        console.log(`[teamforge] Switch runtime: ${status.onlineAgents}/${status.agents.length} agents online · room ${status.roomId ?? 'not provisioned'}${status.lastError ? ` · ${status.lastError}` : ''}`);
      })
      .catch((err) => console.error('[teamforge] Switch runtime failed:', err));
  }

  const shutdown = async () => {
    stopScheduler();
    await stopSwitchRuntime();
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error('[teamforge] fatal', err); process.exit(1); });
