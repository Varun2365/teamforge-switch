import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('e2e/results.partial.json', 'utf8'));
const results = data.results ?? [];
const verdict = (r) => {
  const total = r.checks?.length ?? 0;
  const pass = r.checks?.filter((c) => c.pass).length ?? 0;
  return total === 0 ? 'INFO' : pass === total ? 'PASS' : pass > 0 ? 'PARTIAL' : 'FAIL';
};
const lines = [];
lines.push('# TEAMFORGE — End-to-End Verification Report');
lines.push(`Generated: ${new Date().toISOString()} · live runtime · MongoDB \`teamforge-ops\` · org **Acme Technologies** (created entirely through messages)`);
lines.push('');
lines.push('## Summary');
const counts = {};
for (const r of results) counts[verdict(r)] = (counts[verdict(r)] ?? 0) + 1;
lines.push(Object.entries(counts).map(([k, v]) => `- **${k}**: ${v}`).join('\n'));
lines.push('');
lines.push('| # | Scenario | Sender | Message | Actual reply (trimmed) | Brain | Tools | Checks | Verdict |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
results.forEach((r, i) => {
  const pass = r.checks?.filter((c) => c.pass).length ?? 0;
  const total = r.checks?.length ?? 0;
  lines.push(`| ${i + 1} | ${r.scenario} | ${r.sender} | ${(r.body ?? '').replace(/\|/g, '\\|').slice(0, 64)} | ${(r.reply ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 130)} | ${r.brain} | ${(r.tools ?? []).join(', ') || '—'} | ${pass}/${total} | **${verdict(r)}** |`);
});
lines.push('');
lines.push('## Evidence detail');
for (const r of results) {
  lines.push(`### ${r.scenario} — ${r.sender}: ${(r.body ?? '').slice(0, 100)}`);
  lines.push(`- **Reply:** ${(r.reply ?? '(none)').slice(0, 700)}`);
  lines.push(`- **Brain:** ${r.brain} · **Latency:** ${r.ms ?? 'n/a'}ms · **Tools:** ${(r.tools ?? []).join(', ') || 'none'}`);
  for (const c of r.checks ?? []) lines.push(`- ${c.pass ? '✅' : '❌'} ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
  if (r.note) lines.push(`- Note: ${r.note}`);
  lines.push('');
}
lines.push('## Method & honest limitations');
lines.push('- Messages are injected at the Switch ingest boundary (`/api/debug/simulate-message`); the runtime processes them exactly like a Switch room event and replies are posted to the real `#teamforge-lobby` via Switch. Assertions read MongoDB directly.');
lines.push('- The runtime uses a single AI operations agent; specialist delegation through Switch is represented by internal routing, not separate live Switch handoffs. Scenario 6 (cross-agent) is therefore reported from real tool use, not agent-to-agent Switch traffic.');
lines.push('- Discord typing indicators only appear for Switch Console-managed sessions, not custom WebSocket agents like ours; replies are nevertheless delivered through Switch.');
lines.push('- The suite was executed with `deepseek-v4.1-flash` (owner requirement). Some multi-tool turns take 20–60s; pure questions answer in ~3–9s.');
lines.push('- This report includes every result captured up to the cut-off time; any scenario missing here did not run before the report was generated.');
writeFileSync('E2E_REPORT.md', lines.join('\n'));
console.log(`Report written: ${results.length} results`);
