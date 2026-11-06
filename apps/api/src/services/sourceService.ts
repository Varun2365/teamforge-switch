import { SourceModel, type Source } from '../db/models/memory.js';

export interface SourceInput {
  orgId: string;
  type: 'discord_message' | 'switch_room' | 'manual' | 'document' | 'meeting' | 'seed' | 'system' | 'external';
  ref?: string | null;
  url?: string | null;
  roomId?: string | null;
  channelId?: string | null;
  authorUserId?: string | null;
  authorName?: string | null;
  excerpt?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordSource(input: SourceInput): Promise<Source> {
  const doc = await SourceModel.create({
    orgId: input.orgId,
    type: input.type,
    ref: input.ref ?? undefined,
    url: input.url ?? undefined,
    roomId: input.roomId ?? undefined,
    channelId: input.channelId ?? undefined,
    authorUserId: input.authorUserId ?? undefined,
    authorName: input.authorName ?? undefined,
    excerpt: input.excerpt?.slice(0, 500),
    capturedAt: new Date(),
    metadata: input.metadata ?? {},
  });
  return doc.toObject() as Source;
}

export async function getSource(orgId: string, sourceId: string) {
  return SourceModel.findOne({ orgId, _id: sourceId }).lean();
}
