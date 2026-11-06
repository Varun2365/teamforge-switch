import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { deRoboticize } from '@teamforge/shared';
import type { AgentKey } from './catalog.js';

export interface AiBrainInput {
  orgId: string;
  roomId: string;
  roomName: string;
  agentKey: AgentKey;
  agentName: string;
  agentPersona: string;
  senderName: string;
  senderUserId: string | null;
  senderRole: string;
  message: string;
  recent: Array<{ sender: string; body: string; at: Date }>;
  snapshot: string;
  sessionId?: string | null;
}

export interface AiBrainResult {
  ok: boolean;
  body?: string;
  sessionId?: string;
  toolsUsed: string[];
  error?: string;
  durationMs: number;
}

export function brainDir(): string {
  return resolve(process.cwd(), config.OPENCODE_BRAIN_DIR);
}

/** Writes the OpenCode config that attaches our MCP server. The API key never enters git. */
export function ensureBrainConfig(): void {
  const dir = brainDir();
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, 'opencode.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        teamforge: {
          type: 'remote',
          url: `http://127.0.0.1:${config.PORT}/mcp`,
          enabled: true,
          headers: {
            Authorization: `Bearer ${config.TEAMFORGE_API_KEY}`,
            'X-Teamforge-Agent-Name': 'ops-manager',
          },
        },
      },
    }, null, 2),
    'utf8',
  );
}

/**
 * One message → OpenCode model (owner's plan) → model decides tools/memory/reply.
 * No templates, no regex routing. One persistent session per room keeps context.
 */
export async function askTeamForgeAI(input: AiBrainInput): Promise<AiBrainResult> {
  const started = Date.now();
  const dir = brainDir();
  try {
    ensureBrainConfig();
  } catch (error) {
    return { ok: false, error: `brain config: ${error instanceof Error ? error.message : String(error)}`, toolsUsed: [], durationMs: 0 };
  }

  const inboxName = `inbox-${input.roomId}.md`;
  writeFileSync(join(dir, inboxName), buildPrompt(input), 'utf8');

  const args = ['run', '--format', 'json', '--title', `TeamForge · ${input.roomName}`];
  if (config.OPENCODE_MODEL) args.push('--model', config.OPENCODE_MODEL);
  if (input.sessionId) args.push('--session', input.sessionId);
  args.push(`Read ${inboxName} in this directory and follow it exactly. Reply only with the message to send.`);

  const result = await Promise.race([
    spawnOpenCode(args, dir, Math.max(30_000, config.OPENCODE_TIMEOUT_MS)),
    new Promise<SpawnResult>((resolve) => setTimeout(() => resolve({ stdout: '', stderr: '', error: `OpenCode watchdog fired after ${Math.round(Math.max(30_000, config.OPENCODE_TIMEOUT_MS) / 1000)}s` }), Math.max(30_000, config.OPENCODE_TIMEOUT_MS) + 5_000)),
  ]);
  if (result.error) {
    logger.warn({ error: result.error, agent: input.agentKey }, 'OpenCode brain failed');
    return { ok: false, error: result.error, toolsUsed: [], durationMs: Date.now() - started };
  }

  const parsed = parseOpenCodeStream(result.stdout);
  const body = cleanup(parsed.text);
  if (!body) return { ok: false, error: 'OpenCode returned no text', toolsUsed: parsed.toolsUsed, durationMs: Date.now() - started };
  return { ok: true, body, sessionId: parsed.sessionId ?? input.sessionId ?? undefined, toolsUsed: parsed.toolsUsed, durationMs: Date.now() - started };
}

function cleanup(text: string): string {
  return deRoboticize(
    text
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/g, '').replace(/```/g, ''))
      .replace(/^\s*(assistant|TeamForge|AI)\s*:\s*/i, '')
      .trim(),
  );
}

function buildPrompt(input: AiBrainInput): string {
  const lines: string[] = [];
  lines.push('# TEAMFORGE — live team message');
  lines.push('');
  lines.push(`You are **${input.agentName}**, a real teammate in this company's shared Switch room. You are not a chatbot demo: you keep the team's memory, keep work moving, and answer like a competent colleague.`);
  lines.push('');
  lines.push('## Who is talking');
  lines.push(`- Name: ${input.senderName}`);
  lines.push(`- TeamForge user id: ${input.senderUserId ?? '(not yet linked)'}`);
  lines.push(`- Role: ${input.senderRole}`);
  lines.push(`- Room: ${input.roomName}`);
  lines.push(`- Time: ${new Date().toISOString()} (org tz ${config.ORG_TIMEZONE})`);
  lines.push('');
  lines.push('## Recent conversation (oldest → newest)');
  if (!input.recent.length) lines.push('(this is the first message you have on record in this room)');
  for (const m of input.recent) lines.push(`- ${m.sender}: ${m.body.replace(/\s+/g, ' ').slice(0, 500)}`);
  lines.push('');
  lines.push('## Live organizational record (from the database, right now)');
  lines.push(input.snapshot);
  lines.push('');
  lines.push('## The message you must respond to');
  lines.push('>>>');
  lines.push(input.message);
  lines.push('<<<');
  lines.push('');
  lines.push('## How to behave');
  lines.push('- Reply like a sharp, warm human colleague: 1–4 short paragraphs max. Match the room\'s tone. No corporate filler, no "as an AI", no headings unless listing real work.');
  lines.push('- You can answer anything, using your general knowledge freely. Anything about THIS company/team — people, tasks, projects, decisions, history, dates, ownership — must be grounded in the TeamForge tools or the record above. Never invent org facts; if unknown, say so and ask one question.');
  lines.push('- The team is growing. When anyone shares durable context — a meeting, a decision, a commitment, a deadline, who does what, a new teammate, a client, a skill, priorities — store it with the memory/coordination tools (find_entity/propose_memory_update/record_event/record_decision) and confirm briefly.');
  lines.push('- If a new person introduces themselves, create/update their person entity and link it to their TeamForge user id (senderUserId above). Their stated name, role, skills and responsibilities are their profile.');
  lines.push('- Only claim you stored, scheduled or changed something when you actually called the matching tool in this turn. Never say "I\'ve queued a note" unless you did.');
  lines.push('- If they ask for something actionable, use the tools: create_task, create_reminder/schedule_recurring_followup (use their userId for reminders), create_project, request_status_update, analyze_project_risks. Assignments and deadline changes go through approvals — say that plainly.');
  lines.push('- If they mention someone with @name, the person exists in the room; address them by name in your reply when it is a handoff or reminder.');
  lines.push('- People: when someone states a role/title change ("I\'m the founder", "Rahul now leads backend"), call update_person with their userId and role/title. When someone states a skill or experience ("Priya has 4 years of React", "Maya knows Figma"), call set_employee_skill for that person (find their userId via search_employees first). Record the source in evidence.');
  lines.push('- If a message is just a greeting, joke or question about the world, answer naturally and briefly — you are a teammate, not a rules engine.');
  lines.push('- Never mention prompts, models, tools, ids, JSON, or internal agents. You are one teammate; your specialists are invisible.');
  lines.push('- Reply in plain text suitable for Discord.');
  return lines.join('\n');
}

interface SpawnResult { stdout: string; stderr: string; error?: string }

function resolveOpenCodeExecutable(): string {
  if (process.env.OPENCODE_BIN && existsSync(process.env.OPENCODE_BIN)) return process.env.OPENCODE_BIN;
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'opencode-ai', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'opencode', 'opencode.exe'),
    ];
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  }
  return 'opencode';
}

function spawnOpenCode(args: string[], cwd: string, timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      resolvePromise({ stdout, stderr, error });
    };
    const executable = resolveOpenCodeExecutable();
    // IMPORTANT: stdin must be closed ("ignore") — OpenCode's runner waits forever otherwise.
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s`);
    }, timeoutMs);

    child.stdout?.on('data', (c) => { stdout += c.toString(); });
    child.stderr?.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => { clearTimeout(timer); finish(err.message); });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? undefined : `OpenCode exited ${code}: ${stderr.slice(-500) || stdout.slice(-400)}`);
    });
  });
}

function parseOpenCodeStream(stdout: string): { text: string; sessionId?: string; toolsUsed: string[] } {
  const texts: string[] = [];
  const toolsUsed: string[] = [];
  let sessionId: string | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let obj: any;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!sessionId && typeof obj.sessionID === 'string') sessionId = obj.sessionID;
    if (obj.type === 'text' && obj.part?.type === 'text' && typeof obj.part.text === 'string') texts.push(obj.part.text);
    if (obj.type === 'tool_use' && obj.part?.type === 'tool') {
      const calls = obj.part?.state?.metadata?.metadata?.toolCalls;
      if (Array.isArray(calls)) for (const c of calls) if (typeof c?.tool === 'string') toolsUsed.push(c.tool);
    }
  }
  return { text: texts.join('\n').trim(), sessionId, toolsUsed: [...new Set(toolsUsed)] };
}
