import { AuditLogModel, AgentActionModel } from '../db/models/comms.js';
import { EventModel } from '../db/models/memory.js';

export interface Actor {
  type: 'user' | 'agent' | 'system';
  id?: string;
  name?: string;
}

export async function logAudit(orgId: string, actor: Actor, action: string, target?: { type?: string; id?: string }, detail?: unknown) {
  await AuditLogModel.create({
    orgId,
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetType: target?.type,
    targetId: target?.id,
    detail: detail as never,
  });
}

export async function logAgentAction(
  orgId: string,
  agent: string,
  action: string,
  opts: { roomId?: string; detail?: unknown; inputSummary?: string; outputSummary?: string; demo?: boolean; durationMs?: number; error?: string } = {},
) {
  await AgentActionModel.create({
    orgId,
    agent,
    action,
    roomId: opts.roomId,
    detail: opts.detail as never,
    inputSummary: opts.inputSummary?.slice(0, 400),
    outputSummary: opts.outputSummary?.slice(0, 400),
    demo: opts.demo ?? false,
    durationMs: opts.durationMs,
    error: opts.error,
  });
}

/** Internal typed-event recording. Handlers subscribe in-process; the collection is the audit trail. */
export async function recordEvent(orgId: string, kind: string, payload: unknown, occurredAt: Date = new Date(), sourceId?: string, entityId?: string) {
  return EventModel.create({ orgId, kind, entityId, payload: payload as never, occurredAt, sourceId });
}
