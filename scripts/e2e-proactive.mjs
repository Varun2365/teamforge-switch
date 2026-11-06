import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
await mongoose.connect(env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teamforge-ops');
const db = mongoose.connection.db;
const org = await db.collection('organizations').findOne({});
const orgId = org._id;
const sarah = await db.collection('users').findOne({ orgId, normalizedName: 'sarah' });
if (!sarah) { console.log('no Sarah'); process.exit(0); }
const due = new Date(Date.now() + 12_000).toISOString();
const res = await fetch('http://127.0.0.1:4100/api/reminders', { method: 'POST', headers: { authorization: `Bearer ${env.TEAMFORGE_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'E2E proactive check', body: 'Proactive delivery verification — should arrive once.', userId: String(sarah._id), dueAt: due }) });
console.log('reminder create:', res.status);
await new Promise((r) => setTimeout(r, 26_000));
const notes = await db.collection('notifications').find({ orgId, title: 'E2E proactive check' }).toArray();
console.log('notifications:', notes.map((n) => ({ status: n.status, via: n.deliveredVia, demo: n.demo })));
const reminder = await db.collection('reminders').findOne({ orgId, title: 'E2E proactive check' });
console.log('reminder status:', reminder?.status, 'dueAt', reminder?.dueAt);
const actions = await db.collection('agentactions').find({ orgId, action: 'proactive_post' }).sort({ at: -1 }).limit(2).toArray();
console.log('delivery action:', actions.map((a) => ({ agent: a.agent, summary: a.outputSummary })));
await mongoose.disconnect();
process.exit(0);
