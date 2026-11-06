import mongoose, { Schema, model, type InferSchemaType, type Model, type SchemaDefinition } from 'mongoose';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();
const orgId = { type: String, required: true, index: true };
const mixed = Schema.Types.Mixed;
const uuidRef = (ref: string) => ({ type: String, ref });

const baseSchema = <T extends SchemaDefinition>(def: T) =>
  new Schema({ _id: { type: String, default: uuid }, ...def }, { timestamps: true, minimize: false });

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Goals & projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const goalSchema = baseSchema({
  orgId,
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['active', 'achieved', 'dropped'], default: 'active' },
  targetDate: Date,
  metadata: mixed,
});
export type Goal = InferSchemaType<typeof goalSchema> & { _id: string };
export const GoalModel = (mongoose.models.Goal as Model<Goal>) ?? model<Goal>('Goal', goalSchema);

const projectSchema = baseSchema({
  orgId,
  key: { type: String, required: true }, // short slug e.g. 'website-launch'
  name: { type: String, required: true },
  description: String,
  category: { type: String, default: 'general' }, // extensible â€” orgs define their own
  status: { type: String, enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'], default: 'active', index: true },
  health: { type: String, enum: ['on_track', 'at_risk', 'off_track'], default: 'on_track' },
  startDate: Date,
  dueDate: { type: Date, index: true },
  ownerUserId: uuidRef('User'),
  goalId: uuidRef('Goal'),
  metadata: mixed,
});
projectSchema.index({ orgId: 1, key: 1 }, { unique: true });
export type Project = InferSchemaType<typeof projectSchema> & { _id: string };
export const ProjectModel = (mongoose.models.Project as Model<Project>) ?? model<Project>('Project', projectSchema);

const projectMembershipSchema = baseSchema({
  orgId,
  projectId: uuidRef('Project'),
  userId: uuidRef('User'),
  role: { type: String, enum: ['lead', 'member', 'sponsor'], default: 'member' },
});
projectMembershipSchema.index({ orgId: 1, projectId: 1, userId: 1 }, { unique: true });
export type ProjectMembership = InferSchemaType<typeof projectMembershipSchema> & { _id: string };
export const ProjectMembershipModel = (mongoose.models.ProjectMembership as Model<ProjectMembership>) ?? model<ProjectMembership>('ProjectMembership', projectMembershipSchema);

const milestoneSchema = baseSchema({
  orgId,
  projectId: uuidRef('Project'),
  name: { type: String, required: true },
  dueDate: Date,
  status: { type: String, enum: ['pending', 'at_risk', 'done', 'missed'], default: 'pending' },
  completedAt: Date,
});
export type Milestone = InferSchemaType<typeof milestoneSchema> & { _id: string };
export const MilestoneModel = (mongoose.models.Milestone as Model<Milestone>) ?? model<Milestone>('Milestone', milestoneSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const taskSchema = baseSchema({
  orgId,
  projectId: { ...uuidRef('Project'), index: true },
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'], default: 'todo', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  category: { type: String, default: 'general' }, // extensible
  tags: [String],
  dueDate: { type: Date, index: true },
  startedAt: Date,
  completedAt: Date,
  reporterUserId: uuidRef('User'),
  createdBy: {
    type: { type: String, enum: ['user', 'agent', 'system'], default: 'agent' },
    id: String,
    name: String,
  },
  sourceId: uuidRef('Source'),
  metadata: mixed,
});
taskSchema.index({ orgId: 1, status: 1, dueDate: 1 });
export type Task = InferSchemaType<typeof taskSchema> & { _id: string };
export const TaskModel = (mongoose.models.Task as Model<Task>) ?? model<Task>('Task', taskSchema);

const taskAssignmentSchema = baseSchema({
  orgId,
  taskId: uuidRef('Task'),
  userId: { ...uuidRef('User'), index: true },
  assignedBy: {
    type: { type: String, enum: ['user', 'agent', 'system'], default: 'agent' },
    id: String,
    name: String,
  },
  method: { type: String, enum: ['direct', 'recommended', 'self', 'approval', 'reassigned'], default: 'direct' },
  reason: String,
  active: { type: Boolean, default: true, index: true },
  assignedAt: { type: Date, default: Date.now },
  unassignedAt: Date,
});
taskAssignmentSchema.index({ orgId: 1, taskId: 1, userId: 1, active: 1 });
export type TaskAssignment = InferSchemaType<typeof taskAssignmentSchema> & { _id: string };
export const TaskAssignmentModel = (mongoose.models.TaskAssignment as Model<TaskAssignment>) ?? model<TaskAssignment>('TaskAssignment', taskAssignmentSchema);

const taskDependencySchema = baseSchema({
  orgId,
  taskId: { ...uuidRef('Task'), required: true, index: true },
  dependsOnTaskId: { ...uuidRef('Task'), required: true, index: true },
  kind: { type: String, enum: ['blocks', 'needed_by'], default: 'blocks' },
});
taskDependencySchema.index({ orgId: 1, taskId: 1, dependsOnTaskId: 1, kind: 1 }, { unique: true });
export type TaskDependency = InferSchemaType<typeof taskDependencySchema> & { _id: string };
export const TaskDependencyModel = (mongoose.models.TaskDependency as Model<TaskDependency>) ?? model<TaskDependency>('TaskDependency', taskDependencySchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Commitments, decisions, meetings, documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const commitmentSchema = baseSchema({
  orgId,
  ownerUserId: { ...uuidRef('User'), index: true },
  description: { type: String, required: true },
  dueDate: Date,
  sourceId: uuidRef('Source'),
  relatedTaskId: uuidRef('Task'),
  recipient: String, // e.g. 'client', 'the team', 'Karan'
  status: { type: String, enum: ['open', 'done', 'missed', 'cancelled'], default: 'open', index: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});
commitmentSchema.index({ orgId: 1, status: 1, dueDate: 1 });
export type Commitment = InferSchemaType<typeof commitmentSchema> & { _id: string };
export const CommitmentModel = (mongoose.models.Commitment as Model<Commitment>) ?? model<Commitment>('Commitment', commitmentSchema);

const decisionSchema = baseSchema({
  orgId,
  title: { type: String, required: true },
  summary: String,
  rationale: String,
  projectId: uuidRef('Project'),
  decidedBy: [String], // names or ids â€” kept as strings for flexibility
  decidedAt: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['active', 'superseded'], default: 'active' },
  supersededById: String,
  sourceId: uuidRef('Source'),
});
export type Decision = InferSchemaType<typeof decisionSchema> & { _id: string };
export const DecisionModel = (mongoose.models.Decision as Model<Decision>) ?? model<Decision>('Decision', decisionSchema);

const meetingSchema = baseSchema({
  orgId,
  title: { type: String, required: true },
  kind: { type: String, default: 'team' }, // standup, review, client, planning...
  occurredAt: { type: Date, required: true },
  durationMin: Number,
  attendeeUserIds: [String],
  attendeeNames: [String],
  agenda: String,
  notes: String,
  actionItems: [String],
  sourceId: uuidRef('Source'),
});
meetingSchema.index({ orgId: 1, occurredAt: -1 });
export type Meeting = InferSchemaType<typeof meetingSchema> & { _id: string };
export const MeetingModel = (mongoose.models.Meeting as Model<Meeting>) ?? model<Meeting>('Meeting', meetingSchema);

const documentSchema = baseSchema({
  orgId,
  title: { type: String, required: true },
  kind: { type: String, default: 'doc' },
  storagePath: String,
  url: String,
  projectId: uuidRef('Project'),
  entityId: String,
  metadata: mixed,
});
export type DocumentDoc = InferSchemaType<typeof documentSchema> & { _id: string };
export const DocumentModel = (mongoose.models.Document as Model<DocumentDoc>) ?? model<DocumentDoc>('Document', documentSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Goals link-through: dependencies between entities (docs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
