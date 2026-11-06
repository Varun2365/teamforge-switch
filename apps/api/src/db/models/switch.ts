import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();
const orgId = { type: String, required: true, index: true };
const mixed = Schema.Types.Mixed;

const messageSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    roomId: { type: String, required: true, index: true },
    switchMessageId: { type: String, required: true },
    sourceId: { type: String, index: true },
    senderId: String,
    senderName: String,
    senderKind: { type: String, enum: ['human', 'agent', 'system'], default: 'human' },
    body: { type: String, required: true },
    addressedTo: [String],
    addressed: { type: Boolean, default: false },
    isProcessed: { type: Boolean, default: false, index: true },
    processingResult: mixed,
    threadId: String,
    sentAt: Date,
    metadata: mixed,
  },
  { timestamps: true, minimize: false },
);
messageSchema.index({ orgId: 1, switchMessageId: 1 }, { unique: true });
messageSchema.index({ orgId: 1, roomId: 1, sentAt: -1 });
export type SwitchMessage = InferSchemaType<typeof messageSchema> & { _id: string };
export const MessageModel = (mongoose.models.Message as Model<SwitchMessage>) ?? model<SwitchMessage>('Message', messageSchema);

const conversationSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    roomId: { type: String, required: true },
    switchRoomId: String,
    platform: { type: String, default: 'switch' },
    title: String,
    participants: [String],
    lastMessageAt: Date,
  },
  { timestamps: true, minimize: false },
);
conversationSchema.index({ orgId: 1, roomId: 1 }, { unique: true });
export type SwitchConversation = InferSchemaType<typeof conversationSchema> & { _id: string };
export const ConversationModel = (mongoose.models.Conversation as Model<SwitchConversation>) ?? model<SwitchConversation>('Conversation', conversationSchema);

const switchStateSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    agentKey: { type: String, required: true },
    switchAgentId: String,
    switchName: String,
    connected: { type: Boolean, default: false },
    rooms: [String],
    lastHeartbeatAt: Date,
    lastEventAt: Date,
    lastError: String,
  },
  { timestamps: true, minimize: false },
);
switchStateSchema.index({ orgId: 1, agentKey: 1 }, { unique: true });
export type SwitchState = InferSchemaType<typeof switchStateSchema> & { _id: string };
export const SwitchStateModel = (mongoose.models.SwitchState as Model<SwitchState>) ?? model<SwitchState>('SwitchState', switchStateSchema);
