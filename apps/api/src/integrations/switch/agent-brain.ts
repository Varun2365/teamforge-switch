import { buildToolRegistry } from '../../tools/index.js';
import { logAgentAction } from '../../services/audit.js';
import { AGENT_CATALOG, agentByKey, type AgentKey } from './catalog.js';
import { deRoboticize } from '@teamforge/shared';
import type { AgentHandoff } from './handoff.js';

export interface AgentMessage {
  organizationId: string;
  roomId?: string;
  agentKey: AgentKey;
  body: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  source: 'live' | 'demo';
  messageId?: string;
}

export interface AgentReply {
  agentKey: AgentKey;
  agentName: string;
  body: string;
  toolsUsed: string[];
  toolErrors: string[];
  durationMs: number;
  handoff?: AgentHandoff;
}

const registry = buildToolRegistry();

export function chooseAgent(message: string, fallback: AgentKey = 'operations-manager'): AgentKey {
  const lower = message.toLowerCase();
  const mention = AGENT_CATALOG.find((a) => a.key !== 'operations-manager' && new RegExp(`@${a.switchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\b|$)`, 'i').test(message));
  if (mention) return mention.key;
  if (/\b(research|competitor|market|pricing option|analysis|strategy|alternatives)\b/.test(lower)) return 'research-strategy';
  if (/\b(risk|block|overdue|slip|blast radius|dependency|blocked)\b/.test(lower)) return 'quality-risk';
  if (/\b(plan|timeline|roadmap|milestone|task|assign|break down|estimate|schedule)\b/.test(lower)) return 'project-manager';
  if (/\b(follow.?up|chas(e|ing)|remind|nudge|unanswered|reply draft|summary|digest|recap)\b/.test(lower)) return 'communication';
  if (/\b(remember|memory|who knows|who is|what did we decide|history|earlier|before)\b/.test(lower)) return 'knowledge-memory';
  return fallback;
}

export function planHandoff(message: AgentMessage): AgentHandoff | null {
  if (message.agentKey !== 'operations-manager' || message.source !== 'live') return null;
  const lower = message.body.toLowerCase();
  const mentionedSpecialist = AGENT_CATALOG.find(
    (a) => a.key !== 'operations-manager' && new RegExp(`@${a.switchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\b|$)`, 'i').test(message.body),
  );
  const coordinationIntent = /\b(coordinate|delegate|hand ?off|bring in|loop in|get the team|full team review|all of you|multi-agent)\b/i.test(lower);
  const routed = chooseAgent(message.body, 'operations-manager');
  if (!mentionedSpecialist && !coordinationIntent && routed === 'operations-manager') return null;
  const target = mentionedSpecialist?.key ?? (routed === 'operations-manager' ? 'project-manager' : routed);
  if (target === 'operations-manager') return null;
  return { fromAgentKey: 'operations-manager', toAgentKey: target, instruction: message.body };
}

/* ───────── helpers ───────── */

const firstName = (n: string) => n.split(/\s+/)[0] || n;
const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const withPeriod = (v: string) => (/[.!?]$/.test(v.trim()) ? v.trim() : `${v.trim()}.`);
const dateLabel = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'no date');

function statementText(body: string): string {
  return clean(body.replace(/^@[\w.-]+\s*/i, ''));
}
function looksLikeQuestion(body: string): boolean {
  const t = statementText(body);
  return /\?\s*$/.test(t) || /^(what|who|when|where|why|how|is|are|was|were|do|does|did|can|could|should|would|tell me|show me|any)\b/i.test(t);
}
function significantWords(value: string): string[] {
  const stop = new Set(['what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'and', 'or', 'our', 'we', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'please', 'about', 'tell', 'me', 'with', 'from', 'that', 'this', 'there', 'any', 'all', 'status', 'update', 'team']);
  return clean(value).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).slice(0, 8);
}

const TOOL_BUDGET = 6;

export async function respondAsAgent(message: AgentMessage): Promise<AgentReply> {
  const started = Date.now();
  const catalog = agentByKey(message.agentKey)!;
  const actor = { type: 'agent' as const, id: message.agentKey, name: `agent:${catalog.switchName}` };
  const toolsUsed: string[] = [];
  const toolErrors: string[] = [];

  const use = async (name: string, input: Record<string, unknown> = {}): Promise<any> => {
    if (toolsUsed.length >= TOOL_BUDGET) return null;
    if (!catalog.tools.includes(name)) {
      toolErrors.push(`${name}: not in ${catalog.key}'s toolset`);
      return null;
    }
    const res = await registry.call({ orgId: message.organizationId, actor }, name, input);
    toolsUsed.push(name);
    if (!res.ok) {
      toolErrors.push(`${name}: ${res.error.message}`);
      return null;
    }
    return res.result;
  };

  let body = '';
  try {
    if (message.agentKey === 'operations-manager') body = await operationsReply(message, use);
    else if (message.agentKey === 'project-manager') body = await projectManagerReply(message, use);
    else if (message.agentKey === 'knowledge-memory') body = await knowledgeReply(message, use);
    else if (message.agentKey === 'communication') body = await communicationReply(message, use);
    else if (message.agentKey === 'research-strategy') body = await researchReply(message, use);
    else if (message.agentKey === 'quality-risk') body = await riskReply(message, use);
  } catch (error) {
    toolErrors.push(error instanceof Error ? error.message : String(error));
    body = `Something glitched on my side — ${error instanceof Error ? error.message : String(error)}. Worth another try in a moment.`;
  }
  if (!body.trim()) {
    body = `Not 100% sure how to help with that one yet. Ask me about the project, the board, who's on what, or what's overdue — or bring in a specialist and I'll coordinate.`;
  }

  // record that the agent handled something (await so tests/teardown never race the DB)
  await logAgentAction(message.organizationId, actor.name, 'message_handled', {
    inputSummary: message.body.slice(0, 300),
    outputSummary: body.slice(0, 300),
    durationMs: Date.now() - started,
  });

  const handoff = planHandoff(message) ?? undefined;
  return {
    agentKey: message.agentKey,
    agentName: catalog.name,
    body: deRoboticize(body),
    toolsUsed,
    toolErrors,
    durationMs: Date.now() - started,
    ...(handoff ? { handoff } : {}),
  };
}

/* ───────── Operations Manager ───────── */

/**
 * Live-data fast path for the most common factual questions. Answers come
 * straight from the database in milliseconds, with no model round-trip.
 * Returns null when it cannot answer confidently, so the caller can use the
 * AI brain instead.
 */
export async function tryFastReply(message: AgentMessage): Promise<AgentReply | null> {
  if (message.agentKey !== 'operations-manager') return null;
  const lower = message.body.toLowerCase();
  const isStatus = /\b(status|progress|on track|where (are|is) (we|it|things)|how('s| is) (the|our)?\s*(project|launch|work|website)|what'?s the (status|update))\b/.test(lower);
  const isOwner = /\bwho(?:'s| is| are| owns| own|s)?\s+(handling|owning|owns|working on|on|leading|doing|responsible (?:for)?)\b/.test(lower) || /\bwho knows\b/.test(lower);
  const isOverdue = /\b(what'?s overdue|anything overdue|what'?s blocked|what is blocked|any blockers|what are the risks)\b/.test(lower);
  const isReminder = /\b(remind|reminder)\b/.test(lower);
  if (!isStatus && !isOwner && !isOverdue && !isReminder) return null;

  const reply = await respondAsAgent(message);
  if (/not fully sure|not 100% sure|something glitched/i.test(reply.body)) return null;
  // Fast factual answers are posted by the Operations Manager only — never a
  // handoff, so the room stays one voice.
  return { ...reply, handoff: undefined };
}

async function operationsReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const body = statementText(message.body);
  const lower = body.toLowerCase();
  const orgId = message.organizationId;
  const name = firstName(message.requesterName);

  // 1) statement-like, not a question: capture what we can, acknowledge briefly
  if (!looksLikeQuestion(message.body)) {
    const captured = await captureStatement(message, use, body);
    if (captured) return captured;
  }

  // 2) reminder intents
  const reminder = parseReminderIntent(body);
  if (reminder) {
    const result = await use('create_reminder', {
      title: reminder.title,
      body: reminder.body,
      dueAt: reminder.dueAt.toISOString(),
      userId: message.requesterId.startsWith('switch:') ? null : message.requesterId,
      roomId: message.roomId ?? null,
      idempotencyKey: `agent:reminder:${message.messageId ?? body.slice(0, 32)}`,
    });
    if (result) return `Done — I'll nudge you ${reminder.whenLabel} to ${reminder.title.toLowerCase()}.`;
    return `I heard you want a reminder, but the reminder service balked. Try me again in a bit.`;
  }

  // 3) "who knows X" / skill questions
  const skillMatch = lower.match(/\bwho\s+(?:knows|has experience (?:with|in)|works with)\s+([a-z0-9.+# ]{2,40})/);
  if (skillMatch) {
    const skill = skillMatch[1]!.trim();
    const people = await use('search_employees', { skill });
    if (Array.isArray(people) && people.length) {
      return `${people.slice(0, 4).map((p: any) => p.name).join(', ')} — that's who I'd point you to for ${skill}. Want me to loop any of them in?`;
    }
    return `Nothing on record for ${skill} yet. If someone here has it, say who and I'll pin it to their profile.`;
  }

  // 4) "what did we decide / agreed about X"
  if (/\b(decid|agree|pricing|strategy|last (month|week)|what did we|why did we)\b/.test(lower)) {
    const memory = await use('search_organization_memory', { query: body, limit: 4 });
    const hints: string[] = memory?.answerHints ?? [];
    if (hints.length) {
      return `From the record, ${name}: ${hints.slice(0, 3).map((h: string) => h).join(' · ')}. Happy to pull the full history or the sources behind it if you want.`;
    }
    return `I don't have that on record yet, ${name}. When a decision lands in the room (or a meeting note lands here), I'll keep it — that's how memory gets built.`;
  }

  // 4b) "who's handling X" / "who owns X" — answer with the real assignee and what it waits on
  const ownerMatch = lower.match(/\bwho(?:'s| is| are| owns| own|s)?\s+(?:handling|owning|owns|own|working on|on|leading|doing|responsible for)\s+([a-z0-9 .&+#-]{2,40})/);
  if (ownerMatch) {
    const query = ownerMatch[1]!.replace(/\b(the|a|an|task|work)\b/g, ' ').replace(/[?.,!]+$/, '').trim();
    const found = await use('search_tasks', { query, limit: 5 });
    const tasks = (Array.isArray(found) ? found : []) as any[];
    if (tasks.length) {
      const task = tasks.find((t) => t.assignees?.length) ?? tasks[0];
      const owner = task.assignees?.[0]?.name ?? 'nobody yet';
      const deps = await use('get_task_dependencies', { taskId: task.id ?? task._id });
      const waitingOn = (deps?.dependsOn ?? []).map((d: any) => d?.task?.title).filter(Boolean);
      const lines = [`${owner.split(' ')[0]} has ${task.title} — ${task.status.replace(/_/g, ' ')}, due ${dateLabel(task.dueDate)}.`];
      if (waitingOn.length) lines.push(`It's waiting on ${waitingOn.join(' and ')}.`);
      return lines.join(' ');
    }
  }

  // 5) project / launch / blockers / risk
  if (/\b(project|launch|website|risk|block|overdue|late|slip|behind|deadline|due)\b/.test(lower)) {
    const overdue = await use('get_overdue_tasks', {});
    const projects = (await use('search_projects', { limit: 10 })) as any[] | null;
    const overdueList = (Array.isArray(overdue) ? overdue : []) as any[];
    const list = Array.isArray(projects) ? projects : [];
    const words = significantWords(body);
    const named = list.find((p) => words.some((w) => p.name.toLowerCase().includes(w)));
    const project = named ?? list.find((p) => p.status === 'active') ?? list[0];
    const lines = [`Here's where things stand, ${name}:`];
    if (project) {
      const projectId = project.id ?? project._id;
      const tasks = ((await use('search_tasks', { projectId, limit: 20 })) ?? []) as any[];
      const risky = tasks.filter((t) => t.status === 'blocked');
      const done = tasks.filter((t) => t.status === 'done').length;
      lines.push(`**${project.name}** — ${project.status.replace(/_/g, ' ')} · due ${dateLabel(project.dueDate)} · ${done}/${tasks.length} done${risky.length ? ` · ${risky.length} blocked` : ''}.`);
      for (const t of tasks.filter((t) => t.status !== 'done').slice(0, 6)) {
        const who = (t.assignees?.[0]?.name ?? 'unassigned').split(' ')[0];
        lines.push(`• ${t.title} — ${who} · ${t.status.replace(/_/g, ' ')} · ${dateLabel(t.dueDate)}`);
      }
      if (overdueList.length) {
        const t = overdueList[0]!;
        lines.push(`⚠️ Oldest overdue: ${t.title} — ${(t.assignees?.[0]?.name ?? 'unassigned').split(' ')[0]} · was due ${dateLabel(t.dueDate)} (${t.daysOverdue ?? '?'}d late)`);
      }
      lines.push(`Want me to re-plan the dates or pull the full PDF report?`);
      return lines.join('\n');
    }
    if (overdueList.length) {
      const t = overdueList[0]!;
      lines.push(`⚠️ ${t.title} — ${(t.assignees?.[0]?.name ?? 'unassigned').split(' ')[0]} · was due ${dateLabel(t.dueDate)} (${t.daysOverdue ?? '?'}d late)`);
    }
    lines.push(`Want me to re-plan the dates, or explain what it affects downstream?`);
    return lines.join('\n');
  }

  // 6) generic "how are we doing / status" — the on-demand morning brief
  if (/\b(status|update|how are we|where are we|what's going on|what is going on|brief|sitrep)\b/.test(lower)) {
    return operationsBrief(message, use);
  }

  // 7) plain greeting / thanks / capability probe
  if (/^(hi|hey|hello|good morning|gm)\b/.test(lower)) {
    return `Hey ${name} — ops here. Ask me anything about the org: who's on what, what's slipping, what we decided, or say the word and I'll line up the right specialist.`;
  }

  // 8) catch-all: grounded pointer, no invention
  const overview = await use('get_organization_overview', {});
  if (overview) {
    return `I'm not fully sure what you need, ${name}. Quick map: ${overview.openTasks} open tasks (${overview.overdueTasks} overdue), ${overview.activeProjects} active project, ${overview.pendingApprovals} approval(s) pending. Ask me directly — "who owns the API", "what's overdue", "what did we decide about pricing" — or tell me what outcome you want and I'll drive it.`;
  }
  return `I'm not fully sure what you need, ${name}. Ask me about the org, tasks, people or decisions and I'll ground it in the record.`;
}

async function operationsBrief(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const [overview, overdue, projects] = await Promise.all([
    use('get_organization_overview', {}),
    use('get_overdue_tasks', {}),
    use('search_tasks', { status: 'in_progress', limit: 4 }),
  ]);
  const name = firstName(message.requesterName);
  const lines = [`${name}, here's where things stand.`];
  if (overview) {
    lines.push(`${overview.openTasks} open · ${overview.overdueTasks} overdue · ${overview.blockedTasks} blocked · ${overview.pendingApprovals} approvals waiting.`);
  }
  if (Array.isArray(overdue) && overdue.length) {
    lines.push('Overdue:');
    for (const t of (overdue as any[]).slice(0, 3)) {
      lines.push(`• ${t.title} — ${(t.assignees?.[0]?.name ?? 'unassigned').split(' ')[0]} · was due ${dateLabel(t.dueDate)}`);
    }
  }
  if (Array.isArray(projects) && projects.length) lines.push(`In flight: ${(projects as any[]).slice(0, 3).map((t) => t.title).join(' · ')}`);
  lines.push('Anything you want moved, chased or unblocked?');
  return lines.join('\n');
}

/* ───────── Project Manager ───────── */

async function projectManagerReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const body = statementText(message.body);
  const lower = body.toLowerCase();
  const name = firstName(message.requesterName);

  const createMatch = body.match(/\b(?:create|add|make|new)\s+(?:a\s+)?(?:task|todo|action item)\s*(?::|\-)?\s*["']?([^"'\n.]{4,120})["']?/i);
  if (createMatch) {
    const title = withPeriod(clean(createMatch[1]!.replace(/\.$/, '')));
    const result = await use('create_task', { title });
    if (result) return `Done — created "${result.title ?? title}". Unassigned for now; want me to propose an owner, or are you taking it?`;
    return `Tried to create that task but the backend said no. Check the title and try again?`;
  }

  const overdue = await use('get_overdue_tasks', {});
  if (/\b(overdue|late|slip|behind)\b/.test(lower)) {
    if (Array.isArray(overdue) && overdue.length) {
      return ['Here’s what slipped:', ...overdue.slice(0, 5).map((t: any) => `• ${t.title} — ${(t.assignees?.[0]?.name ?? 'unassigned').split(' ')[0]} · was due ${dateLabel(t.dueDate)}`), 'Want me to re-plan the dates or find who can absorb it?'].join('\n');
    }
    return `Nothing overdue right now. The board is cleaner than it looks.`;
  }

  const projects = await use('search_projects', {});
  if (/\b(project|plan|launch|timeline|where are we|status)\b/.test(lower) && Array.isArray(projects) && projects.length) {
    const p = projects[0]!;
    const health = await use('get_project_health', { projectId: p.id ?? p._id });
    return [`${p.name} — due ${dateLabel(p.dueDate)}.`, health ? `Health: ${health.health?.replace(/_/g, ' ')}${health.reasons?.length ? ` (${health.reasons.join('; ')})` : ''}` : '', `${health?.openTasks ?? '?'} open · ${health?.overdueTasks ?? '?'} overdue · ${health?.blockedTasks ?? '?'} blocked.`, 'Want the full timeline or milestone check?'].filter(Boolean).join('\n');
  }

  return `${name}, tell me the outcome you want — "draft the launch plan", "create a task for X", "what's overdue" — and I'll do the planning. For memory questions @knowledge-memory has the receipts.`;
}

/* ───────── Knowledge & Memory ───────── */

async function knowledgeReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const body = statementText(message.body);
  const lower = body.toLowerCase();
  const name = firstName(message.requesterName);

  if (/\b(working on|who is|who's|what is)\b/.test(lower)) {
    const memory = await use('search_organization_memory', { query: body, limit: 4 });
    const hints: string[] = memory?.answerHints ?? [];
    return hints.length
      ? `On record, ${name}: ${hints.join(' · ')}. That's everything I have — if it changed since, tell me and I'll update history, not erase it.`
      : `Nothing on record for that yet, ${name}. Say it here and I'll remember it.`;
  }

  const memory = await use('search_organization_memory', { query: body, limit: 5 });
  const hints: string[] = memory?.answerHints ?? [];
  if (hints.length) return `Here's what the org knows, ${name}:\n${hints.map((h: string) => `• ${h}`).join('\n')}`;
  return `Memory is quiet on that, so I have nothing reliable to go on yet. Tell me the fact plainly and I will store it with its source so it stays retrievable.`;
}

/* ───────── Communication ───────── */

async function communicationReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const body = statementText(message.body);
  const lower = body.toLowerCase();
  const name = firstName(message.requesterName);

  if (/\b(follow.?up|chase|nudge|remind)\b/.test(lower)) {
    const result = await use('create_follow_up', { about: clean(body), userId: message.requesterId.startsWith('switch:') ? null : message.requesterId });
    if (result) return `On it — follow-up scheduled for ${dateLabel(result.dueAt ?? new Date(Date.now() + 86400000))}. I'll keep it polite but persistent.`;
    return `I couldn't schedule that — want to try with a date?`;
  }
  if (/\b(draft|write|message|email|announce)\b/.test(lower)) {
    return `I can draft that. Tell me audience, the one thing you want them to know, and the ask — I'll keep it short and human, and nothing leaves the building without your yes.`;
  }
  if (/\b(status|update|where are we)\b/.test(lower)) {
    const overdue = await use('get_overdue_tasks', {});
    const n = Array.isArray(overdue) ? overdue.length : 0;
    return `${name}, honest status: ${n} overdue task${n === 1 ? '' : 's'} on the board. I can nudge everyone with one click — want me to?`;
  }
  return `Say the thing you need communicated, ${name} — update, chaser, recap — and I'll put it in shape. External sends always get your approval first.`;
}

/* ───────── Research & Strategy ───────── */

async function researchReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const body = statementText(message.body);
  const name = firstName(message.requesterName);
  const memory = await use('search_organization_memory', { query: body, limit: 5 });
  const hints: string[] = memory?.answerHints ?? [];
  const overview = await use('get_organization_overview', {});
  const lines = [`Here's my read on "${body.slice(0, 60)}${body.length > 60 ? '…' : ''}", ${name}:`];
  if (hints.length) {
    lines.push('What we already know:');
    for (const h of hints.slice(0, 4)) lines.push(`• ${h}`);
  } else {
    lines.push('Memory has no prior art on this — so treat anything I say as unverified, and tell me what to dig for.');
  }
  if (overview) lines.push(`Context: ${overview.activeProjects} active project(s), ${overview.totalPeople} people, ${overview.overdueTasks} overdue task(s).`);
  lines.push('My recommendation: decide with the cheapest reversible step first, and measure. If you want a proper options analysis (with sources named), say so.');
  return lines.join('\n');
}

/* ───────── Quality & Risk ───────── */

async function riskReply(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>): Promise<string> {
  const lower = message.body.toLowerCase();
  const name = firstName(message.requesterName);

  const project = (await use('search_projects', {}))?.[0];
  if (!project) return `No projects in memory yet, ${name} — nothing to threaten. Seed one and I'll watch it.`;

  const report = await use('analyze_project_risks', { projectId: project.id ?? project._id });
  if (!report) return `Risk engine hiccuped. Try again in a moment.`;
  const { risks, health, score } = report as any;

  if (!risks?.length) return `Clean bill of health on ${project.name}, ${name}. ${health === 'on_track' ? 'On track.' : 'Watch loosely.'} I'll keep watching.`;

  const lines = [`${project.name} is ${String(health).replace(/_/g, ' ')} (risk score ${score}), ${name}. What's actually wrong:`];
  for (const r of risks.slice(0, 4)) {
    lines.push(`• [${String(r.severity).toUpperCase()}] ${r.title} — ${r.detail}`);
  }
  lines.push('Recommended moves:');
  for (const r of risks.slice(0, 3)) lines.push(`• ${r.recommendation}`);
  if (/\b(plan|re-?plan|reschedule)\b/.test(lower)) lines.push('Say the word and I will re-plan around this.');
  return lines.join('\n');
}

/* ───────── shared bits ───────── */

async function captureStatement(message: AgentMessage, use: (n: string, i?: Record<string, unknown>) => Promise<any>, statement: string): Promise<string | null> {
  const capitalized = [...new Set((statement.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []).map((w) => w.toLowerCase()).filter((w) => !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(w)))];
  const candidates = capitalized.length ? capitalized : significantWords(statement).slice(0, 3);
  let entity: any = null;
  for (const candidate of candidates.slice(0, 4)) {
    const res = await use('find_entity', { name: candidate });
    const ent = res?.best?.entity;
    if (ent) { entity = ent; break; }
  }
  const excerpt = `${message.requesterName}: ${statement}`.slice(0, 400);
  const ev = await use('record_event', { kind: /\b(meeting|call|sync)\b/i.test(statement) ? 'meeting' : 'note', entityId: entity?._id ?? entity?.id, excerpt, payload: { statement, capturedBy: message.agentKey } });
  if (!ev) return null;
  return entity?.name ? `Got it — noted for ${entity.name}.` : `Got it — noted.`;
}

interface ParsedReminderIntent {
  title: string;
  body: string;
  dueAt: Date;
  whenLabel: string;
}

function parseReminderIntent(body: string): ParsedReminderIntent | null {
  // Two natural orders: "remind me at 7:45pm to review the plan"
  // and "remind me to review the plan at 7:45pm".
  let tail = '';
  let title = '';
  const timeFirst = body.match(/\bremind\s+(?:me\s+)?(?:at|on|by)\s+([^.!?]+?)\s+to\s+(.+)$/i);
  if (timeFirst) {
    tail = timeFirst[1]!.trim().toLowerCase();
    title = clean(timeFirst[2]!.replace(/^that\s+/i, '').replace(/^to\s+/i, ''));
  } else {
    const m = body.match(/\bremind\s+(?:([a-z]+(?:\s+[a-z]+)?)\s+)?(?:me\s+)?(?:to\s+)?(.+?)\s+(?:at|on|by|before)\s+([^.!?]+)/i);
    if (!m) return null;
    tail = m[3]!.trim().toLowerCase();
    title = clean(m[2]!.replace(/^that\s+/i, '').replace(/^to\s+/i, ''));
  }
  const base = new Date();
  let dueAt: Date | null = null;
  let whenLabel = tail;
  const timeMatch = tail.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const dayOffset = /\b(tomorrow)\b/.test(tail) ? 1 : /\b(today)\b/.test(tail) ? 0 : null;
  const weekdayMatch = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].find((d) => tail.includes(d));
  if (timeMatch || dayOffset !== null || weekdayMatch) {
    dueAt = new Date(base);
    if (dayOffset !== null) dueAt.setDate(dueAt.getDate() + dayOffset);
    else if (weekdayMatch) {
      const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekdayMatch);
      let add = (target - dueAt.getDay() + 7) % 7;
      if (add === 0) add = 7;
      dueAt.setDate(dueAt.getDate() + add);
    } else {
      dueAt.setDate(dueAt.getDate() + 1);
    }
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
      const meridiem = timeMatch[3];
      // A bare hour in the past today usually means the next occurrence.
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (!meridiem && hour < 12 && dueAt.getTime() < base.getTime()) hour += 12;
      dueAt.setHours(hour, minute, 0, 0);
      if (dayOffset === null && !weekdayMatch && dueAt.getTime() <= base.getTime()) dueAt.setDate(dueAt.getDate() + 1);
    } else {
      dueAt.setHours(9, 30, 0, 0);
    }
    whenLabel = dueAt.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  if (!dueAt) return null;
  if (title.length < 3) return null;
  return { title: title.charAt(0).toUpperCase() + title.slice(1), body, dueAt, whenLabel };
}
