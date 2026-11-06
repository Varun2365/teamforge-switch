/**
 * Verify the local Switch server is alive and print what to do next.
 * Usage: node scripts/verify-switch.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const base = (env.SWITCH_SERVER_URL || 'http://127.0.0.1:56565').replace(/\/$/, '');

try {
  const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
  const body = await res.text();
  if (res.ok) {
    console.log(`Switch server OK at ${base} → ${body}`);
    console.log('Gateway: check http://127.0.0.1:56564 (Home → Messaging apps) for the Mattermost connection.');
    console.log('Room setup + agent registration: see switch/README.md');
    process.exit(0);
  }
  console.error(`Switch responded HTTP ${res.status}: ${body}`);
  process.exit(1);
} catch (err) {
  console.error(`Switch server unreachable at ${base}: ${err.cause?.code ?? err.message}`);
  console.error('If Switch Console is running, the local server should be — check the Switch Console sidebar and restart it if needed.');
  process.exit(1);
}
