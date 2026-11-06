/**
 * TEAMFORGE bootstrap — creates/keeps the organization and its recurring proactive jobs.
 * It does NOT create people, projects, tasks or memory. Real data comes from the team talking
 * in the Switch room; the AI captures it. Re-running is safe and idempotent.
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from './connection.js';
import { config } from '../config.js';
import { OrganizationModel } from './models/org.js';
import { ensureCoreTypes } from '../services/memoryService.js';
import { ensureRecurringJobs } from '../workers/scheduler.js';
import { logAudit } from '../services/audit.js';

async function main() {
  await connectDb();
  const existing = await OrganizationModel.findOne({ slug: config.ORG_SLUG });
  let org;
  if (existing) {
    org = await OrganizationModel.findOneAndUpdate(
      { _id: existing._id },
      { $set: { name: config.ORG_NAME, 'settings.timezone': config.ORG_TIMEZONE } },
      { new: true },
    );
    console.log(`[bootstrap] org exists: ${config.ORG_NAME} (${config.ORG_SLUG})`);
  } else {
    org = await OrganizationModel.create({
      name: config.ORG_NAME,
      slug: config.ORG_SLUG,
      settings: {
        timezone: config.ORG_TIMEZONE,
        quietHoursStart: config.QUIET_HOURS_START,
        quietHoursEnd: config.QUIET_HOURS_END,
        maxProactivePerDay: config.PROACTIVE_MAX_PER_DAY,
        proactive: { morningBrief: true, overdueScan: true, deadlineFollowUps: true, commitmentChecks: true },
        terminology: {},
      },
      metadata: { bootstrapped: true },
    });
    console.log(`[bootstrap] org created: ${config.ORG_NAME} (${config.ORG_SLUG})`);
  }

  await ensureCoreTypes(null);
  await ensureRecurringJobs(org!._id);
  await logAudit(org!._id, { type: 'system', name: 'bootstrap' }, 'organization.bootstrapped', { type: 'organization', id: org!._id }, { name: config.ORG_NAME });

  console.log('[bootstrap] done — no sample people, tasks or memory were created.');
  console.log('            Introduce the team in the Switch room; the AI builds the org record from there.');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => { console.error('[bootstrap] failed', err); process.exit(1); });
