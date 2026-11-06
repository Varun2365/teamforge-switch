import mongoose, { Schema, model, type InferSchemaType, type Model, type SchemaDefinition } from 'mongoose';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();

const baseSchema = <T extends SchemaDefinition>(def: T) =>
  new Schema({ _id: { type: String, default: uuid }, ...def }, { timestamps: true, minimize: false });

const orgId = { type: String, required: true, index: true };
const mixed = Schema.Types.Mixed;
const uuidRef = (ref: string) => ({ type: String, ref });

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Organizations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const organizationSchema = baseSchema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    quietHoursStart: { type: String, default: '21:30' },
    quietHoursEnd: { type: String, default: '08:30' },
    maxProactivePerDay: { type: Number, default: 6 },
    proactive: {
      morningBrief: { type: Boolean, default: true },
      overdueScan: { type: Boolean, default: true },
      deadlineFollowUps: { type: Boolean, default: true },
      commitmentChecks: { type: Boolean, default: true },
    },
    switchRoomIds: { type: String, default: null },
    terminology: mixed, // e.g. { task: 'ticket', project: 'campaign' }
  },
  metadata: mixed,
});
export type Organization = InferSchemaType<typeof organizationSchema> & { _id: string };
export const OrganizationModel = (mongoose.models.Organization as Model<Organization>) ?? model<Organization>('Organization', organizationSchema);

const departmentSchema = baseSchema({
  orgId,
  name: { type: String, required: true },
  normalizedName: { type: String, required: true, index: true },
  description: String,
  parentDepartmentId: uuidRef('Department'),
  metadata: mixed,
});
departmentSchema.index({ orgId: 1, normalizedName: 1 }, { unique: true });
export type Department = InferSchemaType<typeof departmentSchema> & { _id: string };
export const DepartmentModel = (mongoose.models.Department as Model<Department>) ?? model<Department>('Department', departmentSchema);

const teamSchema = baseSchema({
  orgId,
  name: { type: String, required: true },
  normalizedName: { type: String, required: true, index: true },
  description: String,
  departmentId: uuidRef('Department'),
  metadata: mixed,
});
teamSchema.index({ orgId: 1, normalizedName: 1 }, { unique: true });
export type Team = InferSchemaType<typeof teamSchema> & { _id: string };
export const TeamModel = (mongoose.models.Team as Model<Team>) ?? model<Team>('Team', teamSchema);

const teamMembershipSchema = baseSchema({
  orgId,
  teamId: uuidRef('Team'),
  userId: uuidRef('User'),
  role: { type: String, enum: ['lead', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
});
teamMembershipSchema.index({ orgId: 1, teamId: 1, userId: 1 }, { unique: true });
export type TeamMembership = InferSchemaType<typeof teamMembershipSchema> & { _id: string };
export const TeamMembershipModel = (mongoose.models.TeamMembership as Model<TeamMembership>) ?? model<TeamMembership>('TeamMembership', teamMembershipSchema);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ People â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const userSchema = baseSchema({
  orgId,
  name: { type: String, required: true },
  normalizedName: { type: String, required: true, index: true },
  email: { type: String, lowercase: true, trim: true },
  role: { type: String, enum: ['owner', 'administrator', 'manager', 'team_lead', 'employee', 'external'], default: 'employee' },
  status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
  discordId: String,
  switchUserId: String,
  timezone: String,
  quietHoursStart: String,
  quietHoursEnd: String,
  maxProactivePerDay: Number,
  lastSeenAt: Date,
  metadata: mixed,
});
userSchema.index({ orgId: 1, email: 1 }, { unique: true, sparse: true });
userSchema.index({ orgId: 1, discordId: 1 }, { sparse: true });
export type User = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = (mongoose.models.User as Model<User>) ?? model<User>('User', userSchema);

const employeeProfileSchema = baseSchema({
  orgId,
  userId: { ...uuidRef('User'), required: true, unique: true },
  title: String,
  departmentId: uuidRef('Department'),
  teamIds: [String],
  managerUserId: uuidRef('User'),
  location: String,
  joinedAt: Date,
  bio: String,
  metadata: mixed,
});
export type EmployeeProfile = InferSchemaType<typeof employeeProfileSchema> & { _id: string };
export const EmployeeProfileModel = (mongoose.models.EmployeeProfile as Model<EmployeeProfile>) ?? model<EmployeeProfile>('EmployeeProfile', employeeProfileSchema);

const skillSchema = baseSchema({
  orgId,
  name: { type: String, required: true },
  normalizedName: { type: String, required: true },
  category: String,
  metadata: mixed,
});
skillSchema.index({ orgId: 1, normalizedName: 1 }, { unique: true });
export type Skill = InferSchemaType<typeof skillSchema> & { _id: string };
export const SkillModel = (mongoose.models.Skill as Model<Skill>) ?? model<Skill>('Skill', skillSchema);

const employeeSkillSchema = baseSchema({
  orgId,
  userId: uuidRef('User'),
  skillId: uuidRef('Skill'),
  level: { type: Number, min: 1, max: 5, default: 3 },
  confirmedBy: { type: String, enum: ['self', 'manager', 'source', 'agent_inferred'], default: 'self' },
  sourceId: uuidRef('Source'),
});
employeeSkillSchema.index({ orgId: 1, userId: 1, skillId: 1 }, { unique: true });
export type EmployeeSkill = InferSchemaType<typeof employeeSkillSchema> & { _id: string };
export const EmployeeSkillModel = (mongoose.models.EmployeeSkill as Model<EmployeeSkill>) ?? model<EmployeeSkill>('EmployeeSkill', employeeSkillSchema);

const aliasSchema = baseSchema({
  orgId,
  alias: { type: String, required: true },
  normalizedAlias: { type: String, required: true },
  entityType: { type: String, default: 'person' },
  entityId: String, // references entities or users (person aliases resolve to users when possible)
  sourceId: uuidRef('Source'),
  confidence: { type: Number, min: 0, max: 1, default: 0.8 },
  status: { type: String, enum: ['active', 'proposed', 'rejected'], default: 'active' },
});
aliasSchema.index({ orgId: 1, normalizedAlias: 1 });
export type Alias = InferSchemaType<typeof aliasSchema> & { _id: string };
export const AliasModel = (mongoose.models.Alias as Model<Alias>) ?? model<Alias>('Alias', aliasSchema);
