/**
 * Verify the TEAMFORGE MCP endpoint the way an agent sees it.
 * Usage: node scripts/check-mcp.mjs [toolName] [jsonArgs]
 * Example: node scripts/check-mcp.mjs get_overdue_tasks '{}'
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
const url = process.env.TEAMFORGE_MCP_URL || `http://127.0.0.1:${env.PORT || '4100'}/mcp`;
const key = env.TEAMFORGE_API_KEY || 'change-me-dev-key';
const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'X-Teamforge-Agent-Name': 'check-mcp',
};

const rpc = async (id, method, params) => {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
  const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
  if (!dataLine) throw new Error(`No data frame in response: ${raw.slice(0, 300)}`);
  return JSON.parse(dataLine.slice(5).trim());
};

const init = await rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'check-mcp', version: '1.0.0' } });
console.log('initialize →', init?.result?.serverInfo ?? init);

const list = await rpc(2, 'tools/list', {});
const tools = list?.result?.tools ?? [];
console.log(`tools/list → ${tools.length} tools`);

const toolName = process.argv[2];
if (toolName) {
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const call = await rpc(3, 'tools/call', { name: toolName, arguments: args });
  console.log(`tools/call ${toolName} →`, JSON.stringify(call?.result ?? call?.error, null, 2).slice(0, 4000));
} else {
  console.log('First 15:', tools.slice(0, 15).map((t) => t.name).join(', '));
}
