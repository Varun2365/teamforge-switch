import { AGENT_CATALOG, type AgentKey } from './catalog.js';

export type SenderKind = 'human' | 'agent' | 'system';

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function senderKindOf(payload: Record<string, unknown> | null | undefined): SenderKind {
  const kind = String(payload?.sender_kind ?? '').toLowerCase();
  if (kind === 'agent') return 'agent';
  if (kind === 'platform' || kind === 'system') return 'system';
  return 'human';
}

export function isAgentIdentity(name: string): boolean {
  const value = normalizeName(name);
  if (!value) return false;
  return AGENT_CATALOG.some(
    (agent) => normalizeName(agent.switchName) === value || normalizeName(agent.name) === value || value === normalizeName(`${agent.name}${agent.switchName}`),
  );
}

export function extractAgentMentions(body: string, nameFor: (key: AgentKey) => string): AgentKey[] {
  const found: AgentKey[] = [];
  for (const entry of AGENT_CATALOG) {
    const names = [nameFor(entry.key), entry.switchName, entry.name];
    const matched = names.some((name) => new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\b|$)`, 'i').test(body));
    if (matched) found.push(entry.key);
  }
  return found;
}

/**
 * WHO answers a message. Pure logic — unit-tested.
 * Humans: unaddressed → operations-manager; addressed mentions → only mentioned agents.
 * Handoffs (agent→agent, marker body) → only the recipient.
 * Agent/system traffic → never answered (loop prevention).
 */
export function shouldRespond(
  agentKey: AgentKey,
  senderKind: SenderKind,
  addressed: boolean,
  mentions: AgentKey[],
  handoffForMe: boolean,
): boolean {
  if (handoffForMe) return true;
  if (senderKind !== 'human') return false;
  // Explicit mention → only that agent. Otherwise exactly one voice: the operations manager.
  // (An "addressed" flag without a parsed mention must NOT wake all six agents.)
  if (mentions.length) return addressed && mentions.includes(agentKey);
  return agentKey === 'operations-manager';
}
