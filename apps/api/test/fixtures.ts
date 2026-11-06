import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { OrganizationModel, UserModel, EmployeeProfileModel, SkillModel, EmployeeSkillModel, AliasModel, DepartmentModel, TeamModel, TeamMembershipModel } from '../src/db/models/org.js';
import { EntityModel, FactModel, RelationshipModel, EventModel, SourceModel, MemoryProposalModel, MemoryVersionModel, EntityTypeModel, RelationshipTypeModel } from '../src/db/models/memory.js';
import { ProjectModel, TaskModel, TaskAssignmentModel, TaskDependencyModel, MilestoneModel, GoalModel, DecisionModel, MeetingModel, CommitmentModel, DocumentModel, ProjectMembershipModel } from '../src/db/models/ops.js';
import { ReminderModel, ScheduledJobModel, ApprovalModel, AgentActionModel, NotificationModel, AuditLogModel, RoomMappingModel } from '../src/db/models/comms.js';
import { ensureCoreTypes } from '../src/services/memoryService.js';
import { normalizeName } from '@teamforge/shared';

export const TEST_URI = 'mongodb://127.0.0.1:27017/teamforge-test-ops';

const ALL_MODELS = [
  OrganizationModel, DepartmentModel, TeamModel, TeamMembershipModel, UserModel, EmployeeProfileModel,
  SkillModel, EmployeeSkillModel, AliasModel,
  EntityTypeModel, RelationshipTypeModel, EntityModel, FactModel, RelationshipModel, EventModel, SourceModel, MemoryProposalModel, MemoryVersionModel,
  GoalModel, ProjectModel, ProjectMembershipModel, MilestoneModel, TaskModel, TaskAssignmentModel, TaskDependencyModel, DecisionModel, MeetingModel, CommitmentModel, DocumentModel,
  RoomMappingModel, NotificationModel, ReminderModel, ScheduledJobModel, ApprovalModel, AgentActionModel, AuditLogModel,
];

export interface TestOrg {
  orgId: string;
  rahulId: string;
  aaravId: string;
  priyaId: string;
  nehaId: string;
  karanId: string;
  projectId: string;
  apiTaskId: string;
  designTaskId: string;
}

let cached: TestOrg | null = null;

export async function setupTestDb() {
  await connectDb(TEST_URI);
  await mongoose.connection.db!.dropDatabase();
  await ensureCoreTypes(null);
}

export async function teardownTestDb() {
  await disconnectDb();
}

export function testOrg(): TestOrg {
  if (!cached) throw new Error('testOrg() called before seedTestOrg()');
  return cached;
}

/** Minimal but complete org fixture — the backend contract agents depend on. */
export async function seedTestOrg(): Promise<TestOrg> {
  const org = await OrganizationModel.create({
    name: 'Test Org',
    slug: `test-${Math.random().toString(36).slice(2, 8)}`,
    settings: { timezone: 'Asia/Kolkata', quietHoursStart: '21:30', quietHoursEnd: '08:30', maxProactivePerDay: 6, proactive: { morningBrief: true, overdueScan: true, deadlineFollowUps: true, commitmentChecks: true } },
  });
  const orgId = org._id;
  const dept = await DepartmentModel.create({ orgId, name: 'Engineering', normalizedName: 'engineering' });
  const team = await TeamModel.create({ orgId, name: 'Engineering', normalizedName: 'engineering', departmentId: dept._id });

  const mk = async (name: string, role: 'owner' | 'administrator' | 'manager' | 'team_lead' | 'employee' | 'external', title: string, deptId?: string) => {
    const user = await UserModel.create({ orgId, name, normalizedName: normalizeName(name), email: `${normalizeName(name).split(' ')[0]}@test.dev`, role, status: 'active' });
    await EmployeeProfileModel.create({ orgId, userId: user._id, title, departmentId: deptId ?? dept._id, teamIds: [team._id], location: 'Remote', joinedAt: new Date('2024-01-01') });
    await TeamMembershipModel.create({ orgId, teamId: team._id, userId: user._id, role: 'member' });
    return user._id;
  };
  const rahulId = await mk('Rahul Mehta', 'owner', 'Founder & CEO');
  const aaravId = await mk('Aarav Sharma', 'employee', 'Backend Developer');
  const priyaId = await mk('Priya Nair', 'employee', 'UI/UX Designer');
  const nehaId = await mk('Neha Iyer', 'employee', 'Frontend Developer');
  const karanId = await mk('Karan Malhotra', 'manager', 'Marketing Manager');

  const skillSpec: Array<[string, string[]]> = [[aaravId, ['Node.js', 'TypeScript']], [priyaId, ['Figma']], [nehaId, ['React', 'TypeScript']], [karanId, ['SEO']]];
  const skillCache = new Map<string, string>();
  for (const [userId, skills] of skillSpec) {
    for (const s of skills) {
      const key = normalizeName(s);
      let skillId = skillCache.get(key);
      if (!skillId) {
        const skill = await SkillModel.create({ orgId, name: s, normalizedName: key });
        skillId = skill._id;
        skillCache.set(key, skillId);
      }
      await EmployeeSkillModel.create({ orgId, userId, skillId, level: 4, confirmedBy: 'manager' });
    }
  }

  const project = await ProjectModel.create({ orgId, key: 'website-launch', name: 'Website Launch', category: 'launch', status: 'active', health: 'at_risk', dueDate: new Date(Date.now() + 7 * 86400000), ownerUserId: rahulId });
  const apiTask = await TaskModel.create({
    orgId, projectId: project._id, title: 'Backend API integration', status: 'in_progress', priority: 'urgent',
    dueDate: new Date(Date.now() - 2 * 86400000), // overdue
    createdBy: { type: 'agent', id: 'test', name: 'agent:test' },
  });
  const designTask = await TaskModel.create({
    orgId, projectId: project._id, title: 'Landing page design', status: 'in_progress', priority: 'high',
    dueDate: new Date(Date.now() + 3 * 86400000),
    createdBy: { type: 'agent', id: 'test', name: 'agent:test' },
  });
  await TaskAssignmentModel.create({ orgId, taskId: apiTask._id, userId: aaravId, assignedBy: { type: 'agent', id: 'test', name: 'agent:test' }, method: 'direct', active: true });
  await TaskAssignmentModel.create({ orgId, taskId: designTask._id, userId: priyaId, assignedBy: { type: 'agent', id: 'test', name: 'agent:test' }, method: 'direct', active: true });

  cached = { orgId, rahulId, aaravId, priyaId, nehaId, karanId, projectId: project._id, apiTaskId: apiTask._id, designTaskId: designTask._id };
  return cached;
}

export function useTestDb() {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);
}
