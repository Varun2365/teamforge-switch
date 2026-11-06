import mongoose, { Schema, model, type InferSchemaType, type Model, type SchemaDefinition } from 'mongoose';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();
const orgId = { type: String, required: true, index: true };
const mixed = Schema.Types.Mixed;
const uuidRef = (ref: string) => ({ type: String, ref });

const baseSchema = <T extends SchemaDefinition>(def: T) =>
  new Schema({ _id: { type: String, default: uuid }, ...def }, { timestamps: true, minimize: false });

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Sources (provenance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const sourceSchema = baseSchema({
  orgId,
  type: {
    type: String,
    enum: ['discord_message', 'switch_room', 'manual', 'document', 'meeting', 'seed', 'system', 'external'],
    required: true,
  },
  ref: String, // message id / document id / file path / external url
  url: String,
  roomId: String, // Switch room id
  channelId: String, // Discord channel id
  authorUserId: uuidRef('User'),
  authorName: String,
  excerpt: String, // short quote of what was said â€” never the whole raw dump
  capturedAt: { type: Date, default: Date.now },
  metadata: mixed,
});
sourceSchema.index({ orgId: 1, type: 1, ref: 1 });
export type Source = InferSchemaType<typeof sourceSchema> & { _id: string };
export const SourceModel = (mongoose.models.Source as Model<Source>) ?? model<Source>('Source', sourceSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Entity types & entities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const entityTypeSchema = baseSchema({
  orgId: { type: String, default: null, index: true }, // null = built-in core type
  name: { type: String, required: true }, // machine name e.g. 'person', 'custom:asset'
  label: { type: String, required: true },
  description: String,
  isCore: { type: Boolean, default: false },
  metadata: mixed,
});
entityTypeSchema.index({ orgId: 1, name: 1 }, { unique: true, sparse: true });
export type EntityType = InferSchemaType<typeof entityTypeSchema> & { _id: string };
export const EntityTypeModel = (mongoose.models.EntityType as Model<EntityType>) ?? model<EntityType>('EntityType', entityTypeSchema);

const entitySchema = baseSchema({
  orgId,
  type: { type: String, required: true, index: true }, // references entity_types.name (extensible)
  name: { type: String, required: true },
  normalizedName: { type: String, required: true },
  attributes: { type: mixed, default: {} }, // arbitrary per-type attributes (JsonB-equivalent)
  metadata: { type: mixed, default: {} },
  status: { type: String, enum: ['active', 'archived', 'merged'], default: 'active' },
  mergedIntoId: { type: String, default: null },
  sourceId: uuidRef('Source'),
  validFrom: Date,
  validUntil: Date,
  createdBy: { type: String, default: 'system' }, // 'user:<id>' | 'agent:<name>' | 'system'
});
entitySchema.index({ orgId: 1, normalizedName: 1 });
entitySchema.index({ orgId: 1, type: 1, normalizedName: 1 });
export type Entity = InferSchemaType<typeof entitySchema> & { _id: string };
export const EntityModel = (mongoose.models.Entity as Model<Entity>) ?? model<Entity>('Entity', entitySchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Relationships â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const relationshipTypeSchema = baseSchema({
  orgId: { type: String, default: null, index: true },
  name: { type: String, required: true }, // e.g. WORKS_ON
  inverseName: String,
  description: String,
  isCore: { type: Boolean, default: false },
});
relationshipTypeSchema.index({ orgId: 1, name: 1 }, { unique: true, sparse: true });
export type RelationshipType = InferSchemaType<typeof relationshipTypeSchema> & { _id: string };
export const RelationshipTypeModel = (mongoose.models.RelationshipType as Model<RelationshipType>) ?? model<RelationshipType>('RelationshipType', relationshipTypeSchema);

const relationshipSchema = baseSchema({
  orgId,
  type: { type: String, required: true, index: true }, // extensible, e.g. 'WORKS_ON'
  fromEntityId: { type: String, required: true, index: true },
  toEntityId: { type: String, required: true, index: true },
  attributes: { type: mixed, default: {} },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null }, // null = currently in effect
  recordedAt: { type: Date, default: Date.now },
  confidence: { type: Number, min: 0, max: 1, default: 0.9 },
  sourceId: uuidRef('Source'),
  status: { type: String, enum: ['active', 'superseded', 'disputed'], default: 'active' },
  createdBy: { type: String, default: 'system' },
});
relationshipSchema.index({ orgId: 1, fromEntityId: 1, type: 1 });
relationshipSchema.index({ orgId: 1, toEntityId: 1, type: 1 });
export type Relationship = InferSchemaType<typeof relationshipSchema> & { _id: string };
export const RelationshipModel = (mongoose.models.Relationship as Model<Relationship>) ?? model<Relationship>('Relationship', relationshipSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Facts (temporal claims) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const factSchema = baseSchema({
  orgId,
  entityId: { type: String, required: true, index: true },
  predicate: { type: String, required: true, index: true }, // free-form but normalized snake_case
  value: { type: mixed, default: null },
  valueText: { type: String, default: '' }, // flattened rendering for search
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null }, // null = still true
  recordedAt: { type: Date, default: Date.now },
  confidence: { type: Number, min: 0, max: 1, default: 0.9 },
  sourceId: uuidRef('Source'),
  status: { type: String, enum: ['active', 'proposed', 'superseded', 'disputed', 'rejected'], default: 'active' },
  visibilityScope: { type: String, enum: ['org', 'team', 'private', 'restricted'], default: 'org' },
  createdBy: { type: String, default: 'system' },
  supersedesFactId: { type: String, default: null, index: true },
  supersededByFactId: { type: String, default: null },
});
factSchema.index({ orgId: 1, entityId: 1, predicate: 1 });
factSchema.index({ orgId: 1, valueText: 'text', predicate: 'text' });
export type Fact = InferSchemaType<typeof factSchema> & { _id: string };
export const FactModel = (mongoose.models.Fact as Model<Fact>) ?? model<Fact>('Fact', factSchema);

/** Append-only audit of fact changes â€” the "memory_versions" of the spec. */
const memoryVersionSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    orgId,
    factId: { type: String, required: true, index: true },
    action: { type: String, enum: ['created', 'superseded', 'disputed', 'rejected', 'corrected'], required: true },
    before: mixed,
    after: mixed,
    actor: String,
    sourceId: uuidRef('Source'),
    at: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false },
);
export type MemoryVersion = InferSchemaType<typeof memoryVersionSchema> & { _id: string };
export const MemoryVersionModel = (mongoose.models.MemoryVersion as Model<MemoryVersion>) ?? model<MemoryVersion>('MemoryVersion', memoryVersionSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Events & memory proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const eventSchema = baseSchema({
  orgId,
  kind: { type: String, required: true, index: true }, // 'hired', 'decision_made', 'task_completed', ...
  entityId: String,
  payload: { type: mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
  sourceId: uuidRef('Source'),
  recordedAt: { type: Date, default: Date.now },
});
eventSchema.index({ orgId: 1, kind: 1, occurredAt: -1 });
export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: string };
export const EventModel = (mongoose.models.Event as Model<EventDoc>) ?? model<EventDoc>('Event', eventSchema);

const memoryProposalSchema = baseSchema({
  orgId,
  kind: { type: String, enum: ['entity', 'fact', 'relationship', 'event', 'correction', 'merge', 'reassignment', 'deadline_change'], required: true },
  summary: { type: String, required: true },
  payload: { type: mixed, default: {} },
  confidence: { type: Number, min: 0, max: 1, default: 0.7 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'auto_applied'], default: 'pending', index: true },
  requiresApproval: { type: Boolean, default: true },
  proposedBy: { type: String, default: 'agent:operations-manager' },
  sourceId: uuidRef('Source'),
  reviewedBy: String,
  reviewNote: String,
  resolvedAt: Date,
});
memoryProposalSchema.index({ orgId: 1, status: 1, createdAt: -1 });
export type MemoryProposal = InferSchemaType<typeof memoryProposalSchema> & { _id: string };
export const MemoryProposalModel = (mongoose.models.MemoryProposal as Model<MemoryProposal>) ?? model<MemoryProposal>('MemoryProposal', memoryProposalSchema);
