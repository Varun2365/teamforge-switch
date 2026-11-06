import mongoose from 'mongoose';
await mongoose.connect('mongodb://127.0.0.1:27017/teamforge-ops');
const db = mongoose.connection.db;
const msgs = await db.collection('messages').find({}).sort({ createdAt: -1 }).limit(8).toArray();
for (const m of msgs) {
  console.log(JSON.stringify({ t: m.createdAt, sender: m.senderName, kind: m.senderKind, addressed: m.addressed, body: String(m.body).slice(0, 80), status: m.processingResult?.status, brain: m.processingResult?.brain, err: m.processingResult?.error, reply: String(m.processingResult?.reply ?? '').slice(0, 160) }));
}
const states = await db.collection('switchstates').find({}).toArray();
console.log('agents:', states.map((s) => `${s.agentKey}:${s.connected}`).join(' '));
const conv = await db.collection('conversations').find({}).toArray();
console.log('conversations:', conv.map((c) => ({ room: c.roomId, aiSessionId: c.aiSessionId ?? null })));
await mongoose.disconnect();
process.exit(0);
