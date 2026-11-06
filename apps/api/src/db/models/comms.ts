import mongoose, { Schema, model, type InferSchemaType, type Model, type SchemaDefinition } from 'mongoose';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();
const orgId = { type: String, required: true, index: true };
const mixed = Schema.Types.Mixed;

const baseSchema = <T extends SchemaDefinition>(def: T) =>
  new Schema({ _id: { type: String, default: uuid }, ...def }, { timestamps: true, minimize: false });

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Rooms / channel mappings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const roomMappingSchema = baseSchema({
  orgId,
  switchRoomId: { type: String, index: true },
  discordChannelId: String,
  name: { type: String, required: true },
  purpose: String, // 'lobby' | 'approvals' | 'digest' | 'team' | ...
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  agentNames: [String],
  createdBy: { type: String, default: 'system' },
  metadata: mixed,
});
roomMappingSchema.index({ orgId: 1, switchRoomId: 1 });
export type RoomMapping = InferSchemaType<typeof roomMappingSchema> & { _id: string };
export const RoomMappingModel = (mongoose.models.RoomMapping as Model<RoomMapping>) ?? model<RoomMapping>('RoomMapping', roomMappingSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const notificationSchema = baseSchema({
  orgId,
  targetType: { type: String, enum: ['user', 'room'], required: true },
  targetId: { type: String, required: true }, // userId or switchRoomId
  channel: { type: String, enum: ['switch', 'discord', 'dashboard'], default: 'dashboard' },
  title: String,
  body: { type: String, required: true },
  kind: { type: String, default: 'general', index: true }, // reminder, brief, overdue, approval, followup
  dedupeKey: { type: String, index: true },
  status: { type: String, enum: ['pending', 'sent', 'failed', 'suppressed'], default: 'pending' },
  demo: { type: Boolean, default: false },
  sentAt: Date,
  error: String,
  deliveredVia: String, // 'switch' | 'console' | 'api'
  at: { type: Date, default: Date.now },
});
notificationSchema.index({ orgId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: string };
export const NotificationModel = (mongoose.models.Notification as Model<NotificationDoc>) ?? model<NotificationDoc>('Notification', notificationSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Reminders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const repeatRuleSchema = new Schema(
  {
    every: { type: String, enum: ['minute', 'hour', 'day', 'week', 'cron'], required: true },
    interval: { type: Number, default: 1 },
    cron: String,
    until: Date,
  },
  { _id: false },
);

const reminderSchema = baseSchema({
  orgId,
  title: { type: String, required: true },
  body: String,
  userId: String, // target user (null = room-level)
  roomId: String, // target switch room
  dueAt: { type: Date, required: true, index: true },
  repeatRule: { type: repeatRuleSchema, default: null },
  status: { type: String, enum: ['scheduled', 'sent', 'snoozed', 'cancelled', 'failed'], default: 'scheduled', index: true },
  snoozedUntil: Date,
  createdBy: {
    type: { type: String, enum: ['user', 'agent', 'system'], default: 'agent' },
    name: String,
  },
  relatedTaskId: String,
  relatedCommitmentId: String,
  idempotencyKey: { type: String, index: true },
  lastSentAt: Date,
  sentCount: { type: Number, default: 0 },
  quietHoursOverride: { type: Boolean, default: false },
  metadata: mixed,
});
reminderSchema.index({ orgId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export type Reminder = InferSchemaType<typeof reminderSchema> & { _id: string };
export const ReminderModel = (mongoose.models.Reminder as Model<Reminder>) ?? model<Reminder>('Reminder', reminderSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Scheduled jobs (persistent scheduler) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const scheduledJobSchema = baseSchema({
  orgId,
  kind: { type: String, required: true, index: true }, // reminder | morning_brief | overdue_scan | deadline_followup | commitment_check | stale_task_scan
  runAt: { type: Date, required: true, index: true },
  repeatRule: { type: repeatRuleSchema, default: null },
  payload: { type: mixed, default: {} },
  status: { type: String, enum: ['pending', 'running', 'done', 'failed', 'cancelled'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lockedBy: String,
  lockedUntil: Date,
  idempotencyKey: { type: String, index: true },
  lastError: String,
});
scheduledJobSchema.index({ orgId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
scheduledJobSchema.index({ status: 1, runAt: 1 });
export type ScheduledJob = InferSchemaType<typeof scheduledJobSchema> & { _id: string };
export const ScheduledJobModel = (mongoose.models.ScheduledJob as Model<ScheduledJob>) ?? model<ScheduledJob>('ScheduledJob', scheduledJobSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Governance: audit + agent actions + approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const auditLogReal = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    actorType: { type: String, enum: ['user', 'agent', 'system'], required: true },
    actorId: String,
    actorName: String,
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    detail: mixed,
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, minimize: false },
);
auditLogReal.index({ orgId: 1, at: -1 });
export type AuditLog = InferSchemaType<typeof auditLogReal> & { _id: string };
export const AuditLogModel = (mongoose.models.AuditLog as Model<AuditLog>) ?? model<AuditLog>('AuditLog', auditLogReal);

const agentActionReal = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    agent: { type: String, required: true, index: true },
    roomId: String,
    action: { type: String, required: true }, // 'message_handled', 'tool_call', 'delegation', 'handoff', 'proactive_post'
    detail: mixed,
    inputSummary: String,
    outputSummary: String,
    demo: { type: Boolean, default: false, index: true },
    durationMs: Number,
    error: String,
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, minimize: false },
);
agentActionReal.index({ orgId: 1, agent: 1, at: -1 });
export type AgentAction = InferSchemaType<typeof agentActionReal> & { _id: string };
export const AgentActionModel = (mongoose.models.AgentAction as Model<AgentAction>) ?? model<AgentAction>('AgentAction', agentActionReal);

const approvalSchema = baseSchema({
  orgId,
  requesterType: { type: String, enum: ['agent', 'user', 'system'], default: 'agent' },
  requesterName: { type: String, required: true },
  action: { type: String, required: true }, // 'assign_task' | 'reassign' | 'deadline_change' | 'external_message' | 'memory_merge' | ...
  targetType: String,
  targetId: String,
  payload: { type: mixed, default: {} },
  reason: String,
  impact: String,
  approverUserId: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending', index: true },
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: Date,
  resolutionNote: String,
  sourceId: String,
});
approvalSchema.index({ orgId: 1, status: 1, requestedAt: -1 });
export type Approval = InferSchemaType<typeof approvalSchema> & { _id: string };
export const ApprovalModel = (mongoose.models.Approval as Model<Approval>) ?? model<Approval>('Approval', approvalSchema);
