/**
 * TEAMFORGE one-command setup.
 *
 *   npm run setup
 *
 * What it does automatically:
 *   - creates .env from .env.example with a fresh API key
 *   - finds the local Switch server (ports.json / common ports) and checks health
 *   - verifies MongoDB
 *   - bootstraps the organization + recurring jobs (no sample data)
 *   - tells you the one value only a Switch admin can mint (registration key) if missing
 *
 * The only unavoidable manual step is the Switch registration key: it is a credential
 * created by an admin in the Gateway (API Keys → type "registration"). Everything else
 * — agents, room/channel creation, jobs, org — happens automatically on first run.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import mongoose from 'mongoose';

const root = process.cwd();
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

function readEnv() {
  const env = {};
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function setEnv(key, value) {
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text += `${text.endsWith('\n') || !text ? '' : '\n'}${key}=${value}\n`;
  writeFileSync(envPath, text, 'utf8');
}

function detectSwitch() {
  const candidates = [];
  if (process.env.SWITCH_SERVER_URL) candidates.push(process.env.SWITCH_SERVER_URL);
  const portsPaths = [
    join(process.env.APPDATA ?? '', 'switchdash', 'local-switch-server', 'ports.json'),
    join(homedir(), 'Library', 'Application Support', 'switchdash', 'local-switch-server', 'ports.json'),
    join(homedir(), '.config', 'switchdash', 'local-switch-server', 'ports.json'),
  ];
  let gateway = null;
  for (const p of portsPaths) {
    try {
      if (existsSync(p)) {
        const ports = JSON.parse(readFileSync(p, 'utf8'));
        if (ports.api) candidates.push(`http://127.0.0.1:${ports.api}`);
        if (ports.gateway) gateway = `http://127.0.0.1:${ports.gateway}`;
      }
    } catch { /* ignore */ }
  }
  candidates.push('http://127.0.0.1:56565', 'http://127.0.0.1:8080');
  return { candidates: [...new Set(candidates)], gateway: gateway ?? 'http://127.0.0.1:56564' };
}

async function isHealthy(base) {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\nTEAMFORGE setup\n' + '─'.repeat(40));

  // 1) .env
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    setEnv('TEAMFORGE_API_KEY', randomBytes(24).toString('hex'));
    console.log('✓ Created .env with a fresh API key');
  } else {
    console.log('✓ .env already present');
  }
  const env = readEnv();
  if (!env.TEAMFORGE_API_KEY || env.TEAMFORGE_API_KEY === 'change-me-dev-key') {
    setEnv('TEAMFORGE_API_KEY', randomBytes(24).toString('hex'));
    console.log('✓ Generated TEAMFORGE_API_KEY');
  }
  if (!env.ORG_NAME) setEnv('ORG_NAME', 'Teamforge Workspace');
  if (!env.OPENCODE_MODEL) setEnv('OPENCODE_MODEL', 'opencode-go/deepseek-v4.1-flash');
  if (!env.SWITCH_AGENT_SUFFIX) setEnv('SWITCH_AGENT_SUFFIX', '-tf');
  if (!env.SWITCH_ROOM_NAME) setEnv('SWITCH_ROOM_NAME', 'teamforge-lobby');
  if (!env.OPENCODE_TIMEOUT_MS) setEnv('OPENCODE_TIMEOUT_MS', '90000');
  if (!env.SWITCH_AI_RELAY) setEnv('SWITCH_AI_RELAY', 'false');

  // 2) Switch discovery
  const { candidates, gateway } = detectSwitch();
  let switchBase = null;
  for (const candidate of candidates) {
    if (await isHealthy(candidate)) { switchBase = candidate; break; }
  }
  if (switchBase) {
    setEnv('SWITCH_SERVER_URL', switchBase);
    console.log(`✓ Switch server found: ${switchBase}`);
  } else {
    console.log('✗ No local Switch server responded.');
    console.log('  Open Switch Console (its local server must be running), then re-run npm run setup.');
  }

  // 3) Registration key (the one admin-only value)
  let token = env.SWITCH_REGISTRATION_TOKEN;
  if (!token) {
    console.log('\nA Switch registration key is required once. It is an admin credential:');
    console.log(`  1. Open ${gateway} → API Keys`);
    console.log('  2. Create a key of type "registration"');
    console.log('  3. Paste it here (or put SWITCH_REGISTRATION_TOKEN in .env later).');
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('Registration key (leave blank to do this later): ')).trim();
      rl.close();
      if (answer) { setEnv('SWITCH_REGISTRATION_TOKEN', answer); token = answer; console.log('✓ Registration key saved'); }
    } else {
      console.log('  (non-interactive shell: add SWITCH_REGISTRATION_TOKEN to .env and re-run)');
    }
  } else {
    console.log('✓ Switch registration key present');
  }
  if (token) {
    setEnv('SWITCH_AUTO_CONNECT', 'true');
    setEnv('SWITCH_AUTO_PROVISION', 'true');
    setEnv('SWITCH_AUTO_ROUTE', 'true');
  }

  // 4) MongoDB
  const mongoUri = readEnv().MONGODB_URI || 'mongodb://127.0.0.1:27017/teamforge-ops';
  let mongoOk = false;
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    await mongoose.connection.db.admin().ping();
    mongoOk = true;
  } catch { /* handled below */ }
  if (mongoOk) {
    console.log('✓ MongoDB reachable');
    await mongoose.disconnect();
  } else {
    console.log('✗ MongoDB is not reachable at ' + mongoUri);
    console.log('  Start the MongoDB service, or run: docker compose up -d mongo');
    console.log('  (TEAMFORGE stores everything in its own database, teamforge-ops.)');
  }

  // 5) Bootstrap org + jobs
  if (mongoOk) {
    const { spawnSync } = await import('node:child_process');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const res = spawnSync(npm, ['run', 'seed'], { stdio: 'inherit', shell: process.platform === 'win32' });
    console.log(res.status === 0 ? '✓ Organization bootstrapped (no sample data)' : '✗ Bootstrap failed');
  }

  console.log('\nNext:');
  console.log('  npm run dev        # API + Switch agents (:4100)');
  console.log('  npm run dev:web    # dashboard (:5183)');
  if (!token) console.log('\nLive agents will stay offline until SWITCH_REGISTRATION_TOKEN is set. Dashboard/tools still work.');
  console.log('Then say anything in the Switch room — no @mention needed.\n');
  process.exit(0);
}

main().catch((err) => { console.error('[setup] failed', err); process.exit(1); });
