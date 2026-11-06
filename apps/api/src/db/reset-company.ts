/**
 * Reset the demo company to a blank state while keeping the Switch room, agents and Discord channel.
 *
 *   npm run reset:company -- --yes
 *
 * Deletes org-scoped people, work, memory, approvals, reminders, messages and notifications.
 * Keeps: organization, room mappings, Switch agent credentials/state, and recreates recurring jobs.
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from './connection.js';
import { OrganizationModel } from './models/org.js';
import { config } from '../config.js';
import mongoose from 'mongoose';
import { ensureRecurringJobs } from '../workers/scheduler.js';

const yes = process.argv.includes('--yes');

const COLLECTIONS = [
  'users', 'employeeprofiles', 'skills', 'employeeskills', 'departments', 'teams', 'teammemberships', 'aliases',
  'entities', 'facts', 'relationships', 'events', 'memoryversions', 'memoryproposals', 'sources',
  'projects', 'projectmemberships', 'milestones', 'goals', 'decisions', 'meetings', 'commitments', 'documents',
  'tasks', 'taskassignments', 'taskdependencies',
  'approvals', 'notifications', 'reminders', 'scheduledjobs',
  'messages', 'conversations', 'agentactions', 'auditlogs',
];

async function main() {
  if (!yes) {
    console.log('This will delete all people, work, memory, approvals, reminders and messages for the org.');
    console.log('The Switch room, agents and Discord channel mapping are kept.');
    console.log('Re-run with: npm run reset:company -- --yes');
    process.exit(0);
  }

  await connectDb();
  const org = await OrganizationModel.findOne({ slug: config.ORG_SLUG });
  if (!org) { console.error('Organization not found. Run npm run setup first.'); process.exit(1); }
  const orgId = String(org._id);
  const db = mongoose.connection.db!;

  let total = 0;
  for (const name of COLLECTIONS) {
    const res = await db.collection(name).deleteMany({ orgId });
    if (res.deletedCount) console.log(`  cleared ${res.deletedCount} from ${name}`);
    total += res.deletedCount;
  }

  await ensureRecurringJobs(orgId);
  console.log(`\n✓ Blank company ready (${total} records removed).`);
  console.log('  Kept: organization, Switch room mapping, agent identities, Discord channel.');
  console.log('  Next: talk in the room — people, projects and memory will be built from the conversation.');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => { console.error('[reset] failed', err); process.exit(1); });
