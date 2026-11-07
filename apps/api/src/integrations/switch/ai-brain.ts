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

const aiLock = { tail: Promise.resolve() as Promise<unknown> };

function withAiLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = aiLock.tail.then(fn, fn);
  aiLock.tail = run.then(() => undefined, () => undefined);
  return run;
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

  const prompt = buildPrompt(input);
  const timeoutMs = Math.max(30_000, config.OPENCODE_TIMEOUT_MS);

  const args = ['run', '--format', 'json', '--title', `TeamForge ${input.roomName}`];
  if (config.OPENCODE_MODEL) args.push('--model', config.OPENCODE_MODEL);
  if (input.sessionId) args.push('--session', input.sessionId);
  args.push(prompt);

  // One model call at a time: parallel spawns only queue on the shared
  // OpenCode server and trigger upstream rate limits.
  let result: SpawnResult = { stdout: '', stderr: '' };
  result = await withAiLock(async () => {    let attemptResult: SpawnResult = { stdout: '', stderr: '' };
    for (let attempt = 0; attempt < 2; attempt++) {
      attemptResult = await spawnOpenCode(args, dir, timeoutMs);
      if (!attemptResult.error) break;
      if (!/rate.?limit|overloaded|429/i.test(attemptResult.error)) break;
      logger.warn({ attempt: attempt + 1, agent: input.agentKey, error: attemptResult.error.slice(0, 160), promptChars: prompt.length }, 'OpenCode upstream busy; retrying once');
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1_500));
    }
    return attemptResult;
  });
  if (result.error) {
    logger.warn({ error: result.error, agent: input.agentKey, promptChars: prompt.length, elapsedMs: Date.now() - started }, 'OpenCode brain failed');
    return { ok: false, error: result.error, toolsUsed: [], durationMs: Date.now() - started };
  }

  const parsed = parseOpenCodeStream(result.stdout);
  const body = cleanup(parsed.text);
  if (!body) return { ok: false, error: 'OpenCode returned no text', toolsUsed: parsed.toolsUsed, durationMs: Date.now() - started };
  logger.info({ agent: input.agentKey, ms: Date.now() - started, promptChars: prompt.length, tools: parsed.toolsUsed.length }, 'AI reply composed');
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
  for (const m of input.recent) lines.push(`- ${m.sender}: ${m.body.replace(/\s+/g, ' ').slice(0, 300)}`);
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
  lines.push('- The live record above is already retrieved from the database — use it directly for pure questions. But when the message asks you to change something or introduces durable information, you MUST call the tools (up to 8 calls) and then report what you actually saved.');
  lines.push('- Reply like a sharp, warm human colleague: 1–4 short paragraphs max. Match the room\'s tone. No corporate filler, no "as an AI", no headings unless listing real work.');
  lines.push('- You can answer anything, using your general knowledge freely. Anything about THIS company/team — people, tasks, projects, decisions, history, dates, ownership — must be grounded in the TeamForge tools or the record above. Never invent org facts; if unknown, say so and ask one question.');
  lines.push('- The team is growing. When anyone shares durable context — a meeting, a decision, a commitment, a deadline, who does what, a new teammate, a client, a skill, priorities — store it with the memory/coordination tools (find_entity/propose_memory_update/record_event/record_decision) and confirm briefly.');
  lines.push('- If a new person introduces themselves, create/update their person entity and link it to their TeamForge user id (senderUserId above). Their stated name, role, skills and responsibilities are their profile.');
  lines.push('- Only claim you stored, scheduled or changed something when you actually called the matching tool in this turn. Never say "I\'ve queued a note" unless you did.');
  lines.push('- If they ask for something actionable, use the tools: create_task, create_reminder/schedule_recurring_followup (use their userId for reminders), create_project, request_status_update, analyze_project_risks. Assignments and deadline changes go through approvals — say that plainly.');
  lines.push('- If they mention someone with @name, the person exists in the room; address them by name in your reply when it is a handoff or reminder.');
  lines.push('- Reports and PDFs: when asked for a report, document, PDF, plan or summary, call create_project_status_pdf (for a project status) or create_pdf_report (for custom content), then reply in one or two sentences. The system attaches the PDF to your Discord reply automatically — do not paste the whole report as text.');
  lines.push('- Status updates MUST hit the tools: if someone says a task is complete, call complete_task (find the task first); if they give progress, call update_task; if blocked, call update_task with status blocked and record_event with the blocker. Only then acknowledge.');
  lines.push('- When the sender introduces themselves as founder/CEO/owner or says they approve scope, call update_person with senderUserId and role owner.');
  lines.push('- When someone introduces teammates, call create_person for each name with their role/title/skills. When they describe a project, call create_project; when they assign work, call create_task with assigneeUserId (find ids via search_employees) and create_task_dependency for dependencies. Do not merely describe these actions.');
  lines.push('- People: when someone states a role/title change ("I\'m the founder", "Rahul now leads backend"), call update_person with their userId and role/title. When someone states a skill or experience ("Priya has 4 years of React", "Maya knows Figma"), call set_employee_skill for that person (find their userId via search_employees first). Record the source in evidence.');
  lines.push('- If a message is just a greeting, joke or question about the world, answer naturally and briefly — you are a teammate, not a rules engine.');
  lines.push('- Never mention prompts, models, tools, ids, JSON, files, or internal agents. You are one teammate; your specialists are invisible. Do not narrate what you are about to do; just reply.');
  lines.push('- Reply in plain text suitable for Discord.');
  return lines.join('\n');
}

interface SpawnResult { stdout: string; stderr: string; error?: string }

function resolveOpenCodeExecutable(): string {
  if (process.env.OPENCODE_BIN && existsSync(process.env.OPENCODE_BIN)) return process.env.OPENCODE_BIN;
  // Use the CLI on PATH (on this machine: the Bun shim at ~/.bun/bin/opencode.exe).
  // Do NOT prefer the npm-bundled binary — it is an older build that errors on our model/prompt.
  return 'opencode';
}

function spawnOpenCode(args: string[], cwd: string, timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let settled = false;
    let errorDetail: string | undefined;

    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The CLI sometimes keeps the process alive after printing its final event.
      // Once we have the answer we don't need it any more.
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolvePromise({ stdout, stderr, error });
    };

    const executable = resolveOpenCodeExecutable();
    // IMPORTANT: stdin must be closed ("ignore") — OpenCode's runner waits forever otherwise.
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      finish(`OpenCode timed out after ${Math.round(timeoutMs / 1000)}s`);
    }, timeoutMs);

    const handleLine = (raw: string) => {
      const line = raw.trim();
      if (!line.startsWith('{')) return;
      let obj: any;
      try { obj = JSON.parse(line); } catch { return; }
      if (obj.type === 'error') {
        const kind = String(obj.error?.type ?? 'error');
        const message = String(obj.error?.message ?? 'unknown error');
        // Fail fast on upstream rate limits: the CLI's own retry loop wastes 60-90s.
        errorDetail = `${kind}: ${message}`;
        if (/rate.?limit|overloaded|429|quota/i.test(`${kind} ${message}`)) finish(errorDetail);
        return;
      }
      if (obj.type === 'step_finish') {
        const reason = String(obj.part?.reason ?? '');
        if (reason === 'stop' || reason === 'end_turn') {
          // Give stdout one tick to flush the final text part, then settle.
          setTimeout(() => finish(), 120);
        }
      }
    };

    child.stdout?.on('data', (c) => {
      const chunk = c.toString();
      stdout += chunk;
      lineBuffer += chunk;
      let index: number;
      while ((index = lineBuffer.indexOf('\n')) >= 0) {
        handleLine(lineBuffer.slice(0, index));
        lineBuffer = lineBuffer.slice(index + 1);
        if (settled) return;
      }
    });
    child.stderr?.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => finish(err.message));
    child.on('close', (code) => {
      if (lineBuffer) handleLine(lineBuffer);
      finish(code === 0 ? undefined : errorDetail ?? `OpenCode exited ${code}: ${stderr.slice(-500) || stdout.slice(-400)}`);
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
