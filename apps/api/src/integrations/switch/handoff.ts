import { AGENT_CATALOG, isAgentKey, type AgentKey } from './catalog.js';

export const HANDOFF_MARKER = 'TEAMFORGE_HANDOFF';

export interface AgentHandoff {
  fromAgentKey: AgentKey;
  toAgentKey: AgentKey;
  instruction: string;
}

export function buildHandoffBody(handoff: AgentHandoff, nameFor: (key: AgentKey) => string): string {
  const target = nameFor(handoff.toAgentKey);
  return [`@${target}`, `[${HANDOFF_MARKER} from=${handoff.fromAgentKey} to=${handoff.toAgentKey}]`, handoff.instruction.trim()].join('\n');
}

export function parseHandoffBody(body: string): AgentHandoff | null {
  const match = body.match(new RegExp(`\\[${HANDOFF_MARKER}\\s+from=([a-z-]+)\\s+to=([a-z-]+)\\]`, 'i'));
  if (!match) return null;
  const fromAgentKey = match[1]?.toLowerCase();
  const toAgentKey = match[2]?.toLowerCase();
  if (!fromAgentKey || !toAgentKey) return null;
  if (!isAgentKey(fromAgentKey) || !isAgentKey(toAgentKey)) return null;
  if (fromAgentKey === toAgentKey) return null;
  const instruction = body.slice((match.index ?? 0) + match[0].length).trim();
  if (!instruction) return null;
  return { fromAgentKey, toAgentKey, instruction };
}
