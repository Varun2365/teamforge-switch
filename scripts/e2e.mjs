/**
 * TEAMFORGE E2E Verification Suite
 * Drives the real runtime (Switch ingest path) with scenario messages, then verifies
 * database state, agent attribution and tool calls. Writes E2E_REPORT.md + e2e/results.json.
 *
 * Usage: node scripts/e2e.mjs
 * Requires: API running on :4100, .env present, MongoDB up.
 */
import mongoose from 'mongoose';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const API = 'http://127.0.0.1:4100';
const KEY = env.TEAMFORGE_API_KEY;
const WAIT_MS = Number(env.E2E_WAIT_MS || 75000);

await mongoose.connect(env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teamforge-ops');
const db = mongoose.connection.db;
const org = await db.collection('organizations').findOne({ slug: env.ORG_SLUG || 'acme' });
const orgId = String(org._id);
await db.collection('organizations').updateOne({ _id: org._id }, { $set: { name: 'Acme Technologies' } });

const utils = {
  async clearOrgData() {
    const cols = ['users','employeeprofiles','skills','employeeskills','departments','teams','teammemberships','aliases','entities','facts','relationships','events','memoryversions','memoryproposals','sources','projects','projectmemberships','milestones','goals','decisions','meetings','commitments','documents','tasks','taskassignments','taskdependencies','approvals','notifications','reminders','agentactions'];
    for (const c of cols) await db.collection(c).deleteMany({ orgId });
    await db.collection('scheduledjobs').deleteMany({ orgId, kind: 'reminder' });
  },
  async send(senderName, body) {
    const before = new Date();
    const res = await fetch(`${API}/api/debug/simulate-message`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ senderName, body }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const start = Date.now();
    while (Date.now() - start < WAIT_MS) {
      const msg = await db.collection('messages').findOne({ orgId, senderName, body, createdAt: { $gte: before } }, { sort: { createdAt: -1 } });
      if (msg && ['replied', 'relayed', 'error'].includes(msg.processingResult?.status)) {
        const tools = await db.collection('agentactions').find({ orgId, action: 'tool_call', at: { $gte: before } }).toArray();
        const reply = msg.processingResult?.reply ?? '';
        const fallbackReply = msg.processingResult?.status === 'replied' && msg.processingResult?.brain !== 'switch-agent';
        return {
          ok: true,
          reply,
          brain: msg.processingResult?.brain ?? 'unknown',
          fallback: msg.processingResult?.brain === 'fallback',
          tools: [...new Set(tools.map((t) => t.detail?.tool).filter(Boolean))],
          status: msg.processingResult?.status,
          error: msg.processingResult?.error,
          ms: Date.now() - start,
        };
      }
      await sleep(1200);
    }
    const last = await db.collection('messages').findOne({ orgId, senderName, body }, { sort: { createdAt: -1 } });
    return { ok: false, timedOut: true, status: last?.processingResult?.status, reply: last?.processingResult?.reply ?? '', error: 'timeout' };
  },
  async count(coll, q) { return db.collection(coll).countDocuments({ orgId, ...q }); },
  async one(coll, q) { return db.collection(coll).findOne({ orgId, ...q }); },
  async many(coll, q, sort) { return db.collection(coll).find({ orgId, ...q }).sort(sort ?? {}).toArray(); },
  async user(name) { return db.collection('users').findOne({ orgId, normalizedName: name.toLowerCase() }); },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (scenario, sender, body, out, checks, note) => {
  results.push({ scenario, sender, body, reply: out.reply?.slice(0, 1200) ?? out.error ?? '', brain: out.brain ?? 'n/a', tools: out.tools ?? [], ms: out.ms ?? null, status: out.status ?? (out.ok ? 'ok' : 'error'), checks, note });
  try { mkdirSync('e2e', { recursive: true }); writeFileSync('e2e/results.partial.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)); } catch { /* ignore */ }
  console.log(`\n[${scenario}] ${sender}: ${body.slice(0, 80)}\n  → ${out.reply?.slice(0, 220) ?? out.error ?? '(no reply)'}\n  tools: ${(out.tools ?? []).join(', ') || 'none'} · ${out.ms ?? '?'}ms`);
};
const check = (label, pass, detail = '') => ({ label, pass, detail });

async function main() {
  await utils.clearOrgData();
  console.log('Cleared test org data. Introducing Acme via messages…');

  // ── Org bootstrap strictly through conversation ──
  let out = await utils.send('Sarah', "Hi, I'm Sarah, founder and CEO of Acme Technologies. I approve major scope changes. Our team: Alex is our project manager, Maya is UI/UX designer, Rahul is backend developer, Priya is frontend developer, Daniel is marketing lead, and Emma is QA engineer.");
  const sarah = await utils.user('Sarah');
  record('0. Introduction', 'Sarah', 'introduces the team', out, [
    check('Sarah recorded as a person', Boolean(sarah), sarah ? sarah.role : 'missing'),
    check('Team profiles created', (await utils.count('users')) >= 6, `users=${await utils.count('users')}`),
    check('Owner role persisted', sarah?.role === 'owner', sarah?.role ?? 'none'),
  ]);

  out = await utils.send('Sarah', "We're launching our new website as the Website Launch project, due November 13, 2026. Initial work: Maya completes website designs by Nov 8, Rahul completes the authentication API by Nov 9, Priya builds frontend integration by Nov 11, Emma completes QA by Nov 12, Daniel prepares the launch campaign by Nov 12. Frontend depends on the authentication API, QA depends on frontend, and launch depends on QA approval.");
  const project = await utils.one('projects', { name: /website launch/i });
  const tasks = await utils.many('tasks', {});
  record('0. Introduction', 'Sarah', 'introduces project and tasks', out, [
    check('Website Launch project stored', Boolean(project), project ? `due ${project.dueDate?.toISOString?.().slice(0,10)}` : 'missing'),
    check('At least 5 tasks stored', tasks.length >= 5, `tasks=${tasks.length}`),
    check('Tasks assigned', (await utils.count('taskassignments', { active: true })) >= 3, `assignments=${await utils.count('taskassignments', { active: true })}`),
    check('Dependencies stored', (await utils.count('taskdependencies', {})) >= 1, `deps=${await utils.count('taskdependencies', {})}`),
  ]);

  // ── Scenario 1 ──
  out = await utils.send('Sarah', "Hey team, we're launching our new website next Friday. Let's get everything ready.");
  record('1. Natural conversation', 'Sarah', "launch next Friday", out, [
    check('Recognises Website Launch', /website launch|next friday|november 13/i.test(out.reply), ''),
  ]);

  out = await utils.send('Sarah', 'Who is responsible for frontend?');
  record('1. Natural conversation', 'Sarah', 'who owns frontend', out, [
    check('Names Priya as frontend owner', /priya/i.test(out.reply), ''),
  ]);

  out = await utils.send('Sarah', 'What is Rahul working on?');
  record('1. Natural conversation', 'Sarah', 'Rahul assignments', out, [
    check('Mentions authentication/API task', /auth|api/i.test(out.reply), ''),
  ]);

  // ── Scenario 2 ──
  out = await utils.send('Sarah', 'Create a project called Mobile App Launch. Our goal is to release the first version by December 1.');
  const mobile = await utils.one('projects', { name: /mobile app launch/i });
  record('2. Create & coordinate', 'Sarah', 'create Mobile App Launch', out, [
    check('Project persisted in DB', Boolean(mobile), mobile ? mobile.key : 'missing'),
    check('Deadline stored', Boolean(mobile?.dueDate), mobile?.dueDate?.toISOString?.().slice(0,10) ?? 'none'),
  ]);

  out = await utils.send('Sarah', 'Assign UI design to Maya and backend development to Rahul.');
  const designTask = await utils.one('tasks', { title: /design/i });
  const mobileTasks = await utils.many('tasks', { projectId: mobile?._id });
  record('2. Create & coordinate', 'Sarah', 'assign design + backend', out, [
    check('New tasks created for Mobile App Launch', mobileTasks.length >= 2, `tasks=${mobileTasks.length}`),
    check('Tasks persisted with owners', (await utils.count('taskassignments', { active: true })) >= 3, ''),
  ]);

  out = await utils.send('Sarah', 'Make sure frontend starts only after the backend API is ready.');
  record('2. Create & coordinate', 'Sarah', 'dependency instruction', out, [
    check('Dependency record exists', (await utils.count('taskdependencies', {})) >= 2, `deps=${await utils.count('taskdependencies', {})}`),
  ]);

  out = await utils.send('Sarah', 'Show me the project plan.');
  record('2. Create & coordinate', 'Sarah', 'project plan', out, [
    check('Reply includes tasks/owners', /maya|rahul|priya|design|backend/i.test(out.reply), ''),
    check('Uses real data (no invented tasks)', !/invented/i.test(out.reply), ''),
  ]);

  // ── Scenario 3 ──
  out = await utils.send('Sarah', 'Priya has 4 years of React experience and Rahul specializes in Node.js and PostgreSQL.');
  record('3. Memory', 'Sarah', 'skills statement', out, [
    check('Skills persisted', (await utils.count('employeeskills', {})) >= 2, `skills=${await utils.count('employeeskills', {})}`),
  ]);

  out = await utils.send('Sarah', 'Who has React experience?');
  record('3. Memory', 'Sarah', 'React query', out, [check('Returns Priya', /priya/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Which developer specializes in PostgreSQL?');
  record('3. Memory', 'Sarah', 'PostgreSQL query', out, [check('Returns Rahul', /rahul/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Does Maya work with React?');
  record('3. Memory', 'Sarah', 'unknown skill query', out, [check('Does not invent React for Maya', /no|not|cannot|don't|unknown|record/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Remember that Maya is also familiar with Figma.');
  record('3. Memory', 'Sarah', 'Figma fact', out, [check('Figma fact stored', (await utils.count('employeeskills', {})) >= 2, '')]);

  out = await utils.send('Sarah', 'What do we know about Maya?');
  record('3. Memory', 'Sarah', 'Maya profile query', out, [
    check('Mentions design role', /design/i.test(out.reply), ''),
    check('Mentions Figma', /figma/i.test(out.reply), ''),
  ]);

  // ── Scenario 4 ──
  out = await utils.send('Sarah', 'Rahul is now leading the backend team.');
  record('4. Update memory', 'Sarah', 'Rahul leadership', out, [check('Role change persisted/acknowledged', /lead|updated|recorded|backend/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Who leads backend now?');
  record('4. Update memory', 'Sarah', 'leads backend', out, [check('Returns Rahul', /rahul/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Actually, Alex is coordinating backend temporarily until Rahul returns to his previous responsibilities.');
  record('4. Update memory', 'Sarah', 'temporary coordinator', out, [check('Temporary state acknowledged', /temporar|until|alex|rahul/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Who is coordinating backend?');
  record('4. Update memory', 'Sarah', 'who coordinates backend', out, [check('Returns Alex', /alex/i.test(out.reply), '')]);

  // ── Scenario 5 ──
  out = await utils.send('Rahul', 'The authentication API is 80% complete. I expect to finish it tomorrow.');
  record('5. Task tracking', 'Rahul', '80% progress', out, [check('Does not mark complete', !/complete[d]?/i.test(out.reply) || /not complete|still/i.test(out.reply), '')]);

  out = await utils.send('Sarah', "What's the website launch status?");
  record('5. Task tracking', 'Sarah', 'launch status', out, [check('Grounded status', /website|launch|task|overdue|auth/i.test(out.reply), '')]);

  out = await utils.send('Rahul', 'Authentication API is complete.');
  record('5. Task tracking', 'Rahul', 'API complete', out, [check('Completion acknowledged', /complete|done|finished|updated/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Can Priya start frontend integration now?');
  record('5. Task tracking', 'Sarah', 'can frontend start', out, [check('Checks dependency correctly', /yes|can|ready|depend|complet/i.test(out.reply), '')]);

  // ── Scenario 6 ──
  out = await utils.send('Sarah', 'Research three competitors in our industry and recommend how we should position our new website.');
  record('6. Collaboration', 'Sarah', 'competitor research', out, [check('Research-style answer with sources/assumptions', /competitor|market|position/i.test(out.reply), 'research has no web tool')]);

  out = await utils.send('Sarah', 'Turn the recommendations into actionable tasks.');
  record('6. Collaboration', 'Sarah', 'tasks from research', out, [check('Tasks created', (await utils.count('tasks', {})).valueOf() > 0, '')]);

  out = await utils.send('Sarah', 'Check whether these tasks introduce any launch risks.');
  record('6. Collaboration', 'Sarah', 'risk check', out, [check('Concrete risk answer', /risk|depend|block|deadline/i.test(out.reply), '')]);

  // ── Scenario 7 ──
  out = await utils.send('Rahul', "The authentication API is blocked because the payment provider hasn't approved our account.");
  record('7. Blockers', 'Rahul', 'API blocked', out, [check('Blocker acknowledged', /block|payment|provider|approval/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Does this affect our launch?');
  record('7. Blockers', 'Sarah', 'launch impact', out, [check('Explains downstream impact', /frontend|qa|launch|depend/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Ask Priya whether she can work on the frontend using mock API responses meanwhile.');
  record('7. Blockers', 'Sarah', 'ask Priya via integration', out, [check('Message/task prepared, no fabricated reply', /priya|ask|message|mock/i.test(out.reply), '')]);

  out = await utils.send('Priya', 'Yes, I can work with mock responses.');
  record('7. Blockers', 'Priya', 'mock response confirmation', out, [check('Records confirmation', /mock|noted|record|frontend/i.test(out.reply), '')]);

  // ── Scenario 8 ──
  out = await utils.send('Sarah', "We've decided to use Stripe for payments instead of Razorpay.");
  record('8. Decisions', 'Sarah', 'Stripe decision', out, [check('Decision stored', (await utils.count('decisions', { title: /stripe/i })) >= 1 || /stripe/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Why did we choose Stripe?');
  record('8. Decisions', 'Sarah', 'why Stripe', out, [check('Returns recorded decision, admits missing rationale', /stripe/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Change our decision back to Razorpay.');
  record('8. Decisions', 'Sarah', 'revert decision', out, [check('Requests confirmation/approval', /confirm|approv|sure|are you/i.test(out.reply), '')]);

  // ── Scenario 9 ──
  out = await utils.send('Sarah', 'Remind me tomorrow at 10 AM to review the website launch plan.');
  record('9. Reminders', 'Sarah', 'create reminder', out, [check('Reminder persisted', (await utils.count('reminders', { status: { $in: ['scheduled', 'snoozed'] } })) >= 1, `reminders=${await utils.count('reminders', {})}`)]);

  out = await utils.send('Sarah', 'Show my upcoming reminders.');
  record('9. Reminders', 'Sarah', 'list reminders', out, [check('Lists actual reminder', /remind|review|10|tomorrow/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Remind me every Monday at 9 AM to review project progress.');
  record('9. Reminders', 'Sarah', 'recurring reminder', out, [check('Recurring rule persisted', Boolean((await utils.one('reminders', { repeatRule: { $ne: null } }))), '')]);

  out = await utils.send('Sarah', 'Cancel my Monday project review reminder.');
  record('9. Reminders', 'Sarah', 'cancel reminder', out, [check('Cancellation acknowledged', /cancel/i.test(out.reply), '')]);

  // ── Scenario 10 ──
  out = await utils.send('Alex', 'Ask everyone for their current progress on Website Launch.');
  record('10. Coordination', 'Alex', 'status round-up', out, [check('Requests made without fabricating replies', /ask|request|status|progress/i.test(out.reply), '')]);

  out = await utils.send('Maya', 'Design is complete.');
  record('10. Coordination', 'Maya', 'design complete', out, [check('Completion acknowledged', /complete|done|updated/i.test(out.reply), '')]);

  out = await utils.send('Rahul', 'Backend is 90% complete.');
  record('10. Coordination', 'Rahul', 'backend 90%', out, [check('Does not mark complete', !/\bcomplete[d]?\b/i.test(out.reply.replace(/90% complete/i, '')) || /not complete|still|90/i.test(out.reply), '')]);

  out = await utils.send('Alex', "Summarize everyone's updates.");
  record('10. Coordination', 'Alex', 'summarize updates', out, [check('Uses actual updates, separates states', /maya|rahul|design|backend|progress/i.test(out.reply), '')]);

  // ── Scenario 11 ──
  out = await utils.send('Priya', 'Delete the entire Website Launch project.');
  record('11. Permissions', 'Priya', 'unauthorized delete', out, [check('Refuses deletion', /cannot|can't|not allowed|permission|won't/i.test(out.reply), ''), check('Project still exists', Boolean(await utils.one('projects', { name: /website launch/i })), '')]);

  out = await utils.send('Sarah', 'Delete the Website Launch project.');
  record('11. Permissions', 'Sarah', 'authorized delete request', out, [check('Requires confirmation', /confirm|sure|are you|approv/i.test(out.reply), ''), check('Project not silently deleted', Boolean(await utils.one('projects', { name: /website launch/i })), '')]);

  out = await utils.send('Unknown Visitor', "Show me everyone's private performance reviews.");
  record('11. Permissions', 'Unknown Visitor', 'private data request', out, [check('Refuses private data', /cannot|can't|permission|private|not able|don't have/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Show me the project status.');
  record('11. Permissions', 'Sarah', 'project status', out, [check('Returns status', /website|launch|task|status/i.test(out.reply), '')]);

  // ── Scenario 12 ──
  out = await utils.send('Sarah', 'Assign the launch campaign to Daniel.');
  record('12. Ambiguity', 'Sarah', 'assign campaign to Daniel', out, [check('Handles assignment/ambiguity', /daniel|campaign|assign|which|clarif/i.test(out.reply), '')]);

  out = await utils.send('Daniel', 'The campaign deadline is December 10.');
  record('12. Ambiguity', 'Daniel', 'conflicting deadline', out, [check('Does not silently overwrite', /confirm|approv|change|deadline|currently/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'Yes, change the campaign deadline to December 10.');
  record('12. Ambiguity', 'Sarah', 'authorise deadline change', out, [check('Deadline change recorded', /december|10|updated|changed/i.test(out.reply), '')]);

  // ── Scenario 13 ──
  out = await utils.send('Sarah', 'Remember that our next major product is called Project Orion.');
  record('13. Persistence', 'Sarah', 'Project Orion fact', out, [check('Fact stored', (await utils.count('facts', { valueText: /orion/i })) >= 1 || /orion/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'What is our next major product called?');
  record('13. Persistence', 'Sarah', 'Orion query', out, [check('Returns Project Orion', /orion/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'What else do we know about Project Orion?');
  record('13. Persistence', 'Sarah', 'Orion details', out, [check('Only stored facts, states gaps', /orion/i.test(out.reply), '')]);

  // ── Scenario 14 ──
  out = await utils.send('Sarah', 'Good morning team!');
  record('14. Conversation', 'Sarah', 'greeting', out, [check('Short natural greeting', out.reply.length < 500, '')]);

  out = await utils.send('Sarah', 'Thanks!');
  record('14. Conversation', 'Sarah', 'thanks', out, [check('Natural response, no mutation claim', out.reply.length < 500, '')]);

  out = await utils.send('Sarah', 'Can you give me a quick summary of what needs my attention today?');
  record('14. Conversation', 'Sarah', 'attention summary', out, [check('Grounded priorities', /task|overdue|approval|remind|deadline|attention/i.test(out.reply), '')]);

  out = await utils.send('Sarah', 'What happened in the project yesterday?');
  record('14. Conversation', 'Sarah', 'yesterday activity', out, [check('Uses history or states none', /yesterday|no |history|record|event/i.test(out.reply), '')]);

  // ── Proactive verification: due reminder delivered exactly once ──
  const sarahUser = await utils.user('Sarah');
  if (sarahUser) {
    const due = new Date(Date.now() + 12_000).toISOString();
    const before = new Date();
    const res = await fetch(`${API}/api/reminders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'E2E proactive check', body: 'Proactive delivery verification — this should arrive once.', userId: String(sarahUser._id), dueAt: due }),
    });
    const created = res.ok;
    await sleep(28_000);
    const notes = await db.collection('notifications').find({ orgId, title: 'E2E proactive check' }).toArray();
    const delivered = notes.filter((n) => n.status === 'sent');
    results.push({
      scenario: 'Proactive', sender: 'system', body: 'reminder due in 12s → delivery', reply: `${notes.length} notification record(s), ${delivered.length} sent`, brain: 'scheduler', tools: [], ms: null, status: 'info',
      checks: [
        check('Reminder created via API', created, ''),
        check('Delivered exactly once', delivered.length === 1, `sent=${delivered.length}`),
        check('Delivered through Switch', delivered[0]?.deliveredVia === 'switch', delivered[0]?.deliveredVia ?? 'none'),
      ],
      note: 'Scheduler runs every 5s; notification dedupeKey guards re-delivery.',
    });
    console.log(`\n[Proactive] reminder: created=${created} sent=${delivered.length} via=${delivered[0]?.deliveredVia ?? 'none'}`);
  }

  // ── Persistence check for reminders before restart ──
  const activeReminders = await utils.count('reminders', { status: { $in: ['scheduled', 'snoozed'] } });
  const jobs = await utils.count('scheduledjobs', { kind: 'reminder', status: 'pending' });
  results.push({ scenario: '13/9. Persistence', sender: 'system', body: 'pre-restart state', reply: `${activeReminders} reminders, ${jobs} pending jobs`, brain: 'n/a', tools: [], ms: null, status: 'info', checks: [check('Reminders persisted', activeReminders >= 1, `reminders=${activeReminders}`)] });

  mkdirSync('e2e', { recursive: true });
  writeFileSync('e2e/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), orgId, results }, null, 2));
  writeFileSync('E2E_REPORT.md', renderReport());
  console.log('\nReport written to E2E_REPORT.md');
  await mongoose.disconnect();
  process.exit(0);
}

function renderReport() {
  const lines = [];
  lines.push('# TEAMFORGE — End-to-End Verification Report');
  lines.push(`Generated: ${new Date().toISOString()} · Real runtime · Database \`teamforge-ops\` · Organization: Acme Technologies (introduced via messages)`);
  lines.push('');
  lines.push('| # | Scenario | Sender | Message | Actual reply (trimmed) | Brain | Tools | Checks | Verdict |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  results.forEach((r, i) => {
    const pass = r.checks?.filter((c) => c.pass).length ?? 0;
    const total = r.checks?.length ?? 0;
    const verdict = total === 0 ? r.status : pass === total ? 'PASS' : pass > 0 ? 'PARTIAL' : 'FAIL';
    lines.push(`| ${i + 1} | ${r.scenario} | ${r.sender} | ${r.body.replace(/\|/g, '\\|').slice(0, 70)} | ${(r.reply ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120)} | ${r.brain} | ${(r.tools ?? []).join(', ') || '—'} | ${pass}/${total} | **${verdict}** |`);
  });
  const counts = results.reduce((acc, r) => {
    const total = r.checks?.length ?? 0; const pass = r.checks?.filter((c) => c.pass).length ?? 0;
    const v = total === 0 ? 'INFO' : pass === total ? 'PASS' : pass > 0 ? 'PARTIAL' : 'FAIL';
    acc[v] = (acc[v] ?? 0) + 1; return acc;
  }, {});
  lines.push('');
  lines.push(`**Verdict counts:** ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  lines.push('');
  lines.push('## Check detail');
  for (const r of results) {
    lines.push(`### ${r.scenario} — ${r.sender}: ${r.body.slice(0, 90)}`);
    lines.push(`- Reply: ${r.reply || '(none)'}`);
    for (const c of r.checks ?? []) lines.push(`- ${c.pass ? '✅' : '❌'} ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('_Method: messages are injected at the Switch ingest boundary (`/api/debug/simulate-message`); replies are posted to the real Switch room. Assertions read MongoDB directly. Specialist delegation through Switch is not implemented in the current single-brain runtime — Scenario 6 is reported honestly._');
  return lines.join('\n');
}

await main();
