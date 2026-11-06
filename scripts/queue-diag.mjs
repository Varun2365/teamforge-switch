import mongoose from 'mongoose';
await mongoose.connect('mongodb://127.0.0.1:27017/teamforge-ops');
const db = mongoose.connection.db;
const org = await db.collection('organizations').findOne({});
const orgId = org._id;
const since = new Date(Date.now() - 15 * 60 * 1000);
const [last15, processing, pendingJobs, reminders, stuck] = await Promise.all([
  db.collection('messages').countDocuments({ orgId, createdAt: { $gte: since } }),
  db.collection('messages').countDocuments({ orgId, 'processingResult.status': 'processing' }),
  db.collection('scheduledjobs').find({ orgId, status: 'pending' }).sort({ runAt: 1 }).limit(20).toArray(),
  db.collection('reminders').find({ orgId, status: { $in: ['scheduled', 'snoozed'] } }).sort({ dueAt: 1 }).limit(20).toArray(),
  db.collection('messages').find({ orgId, 'processingResult.status': 'processing' }).sort({ createdAt: -1 }).limit(5).toArray(),
]);
console.log('messages last15m:', last15);
console.log('processing now:', processing);
console.log('pending jobs:', pendingJobs.map((j) => `${j.kind} @ ${j.runAt?.toISOString?.() ?? j.runAt} (${j._id})`));
console.log('scheduled reminders:', reminders.map((r) => `${r.title} @ ${new Date(r.dueAt).toISOString()} status=${r.status}`));
console.log('stuck messages:', stuck.map((m) => `${m.senderName}: ${String(m.body).slice(0, 60)}`));
await mongoose.disconnect();
process.exit(0);
