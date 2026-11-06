/**
 * Seeds the Acme Technologies demo organization — idempotent for THIS org only.
 * Wipes and recreates the `acme` org's documents. Never touches other orgs.
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from './connection.js';
import { config } from '../config.js';
import { randomUUID } from 'node:crypto';
import {
  OrganizationModel, DepartmentModel, TeamModel, TeamMembershipModel,
  UserModel, EmployeeProfileModel, SkillModel, EmployeeSkillModel, AliasModel,
} from './models/org.js';
import {
  EntityModel, SourceModel, FactModel, RelationshipModel, EventModel, MemoryVersionModel,
} from './models/memory.js';
import { ensureCoreTypes, createFact, createRelationship, ensurePersonEntity, upsertAlias } from '../services/memoryService.js';
import { normalizeName } from '@teamforge/shared';
import {
  ProjectModel, ProjectMembershipModel, TaskModel, TaskAssignmentModel, TaskDependencyModel,
  MilestoneModel, GoalModel, DecisionModel, MeetingModel, CommitmentModel, DocumentModel,
} from './models/ops.js';
import { ReminderModel, ScheduledJobModel, ApprovalModel, AgentActionModel, NotificationModel, RoomMappingModel } from './models/comms.js';
import { ensureRecurringJobs } from '../workers/scheduler.js';
import { logAudit } from '../services/audit.js';

const daysFromNow = (days: number, hour = 17) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
const daysAgo = (days: number) => daysFromNow(-days);

async function wipeOrg(orgId: string) {
  const all = [
    OrganizationModel, DepartmentModel, TeamModel, TeamMembershipModel, UserModel, EmployeeProfileModel,
    SkillModel, EmployeeSkillModel, EntityModel, SourceModel, FactModel, RelationshipModel, EventModel,
    MemoryVersionModel, ProjectModel, ProjectMembershipModel, TaskModel, TaskAssignmentModel, TaskDependencyModel,
    MilestoneModel, GoalModel, DecisionModel, MeetingModel, CommitmentModel, DocumentModel, AliasModel,
    ReminderModel, ScheduledJobModel, ApprovalModel, AgentActionModel, NotificationModel, RoomMappingModel,
  ] as const;
  for (const M of all) {
    if (M === OrganizationModel) continue;
    await (M as unknown as { deleteMany: (q: Record<string, unknown>) => Promise<unknown> }).deleteMany({ orgId });
  }
}

async function main() {
  await connectDb();
  if (config.ORG_SLUG !== 'acme') throw new Error('Seed only targets ORG_SLUG=acme');

  const existing = await OrganizationModel.findOne({ slug: 'acme' }).lean();
  if (existing) {
    console.log('[seed] wiping existing acme org…');
    await wipeOrg(existing._id);
    await OrganizationModel.deleteOne({ _id: existing._id });
  }

  await ensureCoreTypes(null); // global core types

  const org = await OrganizationModel.create({
    name: 'Acme Technologies',
    slug: 'acme',
    settings: {
      timezone: config.ORG_TIMEZONE,
      quietHoursStart: config.QUIET_HOURS_START,
      quietHoursEnd: config.QUIET_HOURS_END,
      maxProactivePerDay: config.PROACTIVE_MAX_PER_DAY,
      proactive: { morningBrief: true, overdueScan: true, deadlineFollowUps: true, commitmentChecks: true },
      terminology: { task: 'task', project: 'project' },
    },
    metadata: { seeded: true, seedVersion: 1 },
  });
  const orgId = org._id;
  console.log('[seed] org created', orgId);

  /* ── Departments / teams ── */
  const engineering = await DepartmentModel.create({ orgId, name: 'Engineering', normalizedName: 'engineering', description: 'Builds and runs the product' });
  const design = await DepartmentModel.create({ orgId, name: 'Design', normalizedName: 'design', description: 'Product and brand design' });
  const growth = await DepartmentModel.create({ orgId, name: 'Growth', normalizedName: 'growth', description: 'Marketing and demand' });
  const teamEng = await TeamModel.create({ orgId, name: 'Engineering', normalizedName: 'engineering', departmentId: engineering._id, description: 'Backend + frontend' });
  const teamDesign = await TeamModel.create({ orgId, name: 'Design', normalizedName: 'design', departmentId: design._id, description: 'Product design' });
  const teamGrowth = await TeamModel.create({ orgId, name: 'Growth', normalizedName: 'growth', departmentId: growth._id, description: 'Marketing and launches' });

  /* ── People ── */
  const people: Record<string, { name: string; role: 'owner' | 'administrator' | 'manager' | 'team_lead' | 'employee' | 'external'; email: string; title: string; dept: typeof engineering | typeof design | typeof growth; team: typeof teamEng | typeof teamDesign | typeof teamGrowth; location: string; joinedDaysAgo: number; manager?: string }> = {
    rahul: { name: 'Rahul Mehta', role: 'owner', email: 'rahul@acme.dev', title: 'Founder & CEO', dept: engineering, team: teamEng, location: 'Bengaluru', joinedDaysAgo: 720 },
    aarav: { name: 'Aarav Sharma', role: 'employee', email: 'aarav@acme.dev', title: 'Backend Developer', dept: engineering, team: teamEng, location: 'Bengaluru', joinedDaysAgo: 410, manager: 'rahul' },
    priya: { name: 'Priya Nair', role: 'employee', email: 'priya@acme.dev', title: 'UI/UX Designer', dept: design, team: teamDesign, location: 'Remote', joinedDaysAgo: 300, manager: 'rahul' },
    neha: { name: 'Neha Iyer', role: 'employee', email: 'neha@acme.dev', title: 'Frontend Developer', dept: engineering, team: teamEng, location: 'Bengaluru', joinedDaysAgo: 250, manager: 'rahul' },
    karan: { name: 'Karan Malhotra', role: 'manager', email: 'karan@acme.dev', title: 'Marketing Manager', dept: growth, team: teamGrowth, location: 'Mumbai', joinedDaysAgo: 380, manager: 'rahul' },
  };
  const userIds: Record<string, string> = {};
  for (const [key, p] of Object.entries(people)) {
    const user = await UserModel.create({
      orgId,
      name: p.name,
      normalizedName: normalizeName(p.name),
      email: p.email,
      role: p.role,
      status: 'active',
      timezone: config.ORG_TIMEZONE,
      lastSeenAt: new Date(),
    });
    userIds[key] = user._id;
    await EmployeeProfileModel.create({
      orgId,
      userId: user._id,
      title: p.title,
      departmentId: p.dept._id,
      teamIds: [p.team._id],
      managerUserId: p.manager ? undefined : undefined, // filled below
      location: p.location,
      joinedAt: daysAgo(p.joinedDaysAgo),
    });
  }
  // manager links (second pass)
  for (const [key, p] of Object.entries(people)) {
    if (p.manager) await EmployeeProfileModel.updateOne({ orgId, userId: userIds[key] }, { $set: { managerUserId: userIds[p.manager] } });
  }
  // memberships
  await TeamMembershipModel.create([
    { orgId, teamId: teamEng._id, userId: userIds.rahul, role: 'lead' },
    { orgId, teamId: teamEng._id, userId: userIds.aarav, role: 'member' },
    { orgId, teamId: teamEng._id, userId: userIds.neha, role: 'member' },
    { orgId, teamId: teamDesign._id, userId: userIds.priya, role: 'lead' },
    { orgId, teamId: teamGrowth._id, userId: userIds.karan, role: 'lead' },
  ]);

  /* ── Skills ── */
  const skillsSpec: Record<string, Array<[string, number]>> = {
    aarav: [['Node.js', 5], ['PostgreSQL', 4], ['TypeScript', 4], ['API Design', 4], ['MongoDB', 3]],
    priya: [['Figma', 5], ['UI Design', 4], ['CSS', 4], ['Prototyping', 4], ['Design Systems', 4]],
    neha: [['React', 5], ['TypeScript', 4], ['CSS', 5], ['Frontend', 5], ['Tailwind', 4]],
    karan: [['SEO', 4], ['Content Marketing', 4], ['Analytics', 3], ['Launch Strategy', 4]],
    rahul: [['Product Strategy', 5], ['Fundraising', 4]],
  };
  const skillDocs = new Map<string, string>();
  for (const [person, skills] of Object.entries(skillsSpec)) {
    for (const [skill, level] of skills) {
      const key = normalizeName(skill);
      let skillId = skillDocs.get(key);
      if (!skillId) {
        const s = await SkillModel.create({ orgId, name: skill, normalizedName: key, category: 'general' });
        skillId = s._id;
        skillDocs.set(key, skillId);
      }
      await EmployeeSkillModel.create({ orgId, userId: userIds[person], skillId, level, confirmedBy: 'manager' });
    }
  }

  /* ── Seed source (provenance) ── */
  const seedSource = await SourceModel.create({
    orgId,
    type: 'seed',
    ref: 'seed:acme-demo-v1',
    authorName: 'TEAMFORGE seed',
    excerpt: 'Initial demo dataset for Acme Technologies (created by npm run seed).',
  });
  const seedSourceId = String(seedSource._id);

  /* ── Graph: people as entities + org/project/task entities ── */
  const personEntityIds: Record<string, string> = {};
  for (const [key, p] of Object.entries(people)) {
    const ent = await ensurePersonEntity(orgId, userIds[key]!, p.name, seedSourceId, 'agent:seed');
    personEntityIds[key] = ent._id;
  }
  await upsertAlias(orgId, 'Aaru', personEntityIds.aarav!, 'person', seedSourceId, 0.95);
  await upsertAlias(orgId, 'Rahul bhai', personEntityIds.rahul!, 'person', seedSourceId, 0.7);

  const orgEntity = await EntityModel.create({ orgId, type: 'organization', name: 'Acme Technologies', normalizedName: 'acme technologies', attributes: { slug: 'acme' }, sourceId: seedSourceId, createdBy: 'agent:seed' });
  for (const [key] of Object.entries(people)) {
    await createRelationship({ orgId, type: 'WORKS_FOR', fromEntityId: personEntityIds[key]!, toEntityId: orgEntity._id, sourceId: seedSourceId, createdBy: 'agent:seed', confidence: 1 });
  }
  await createRelationship({ orgId, type: 'MEMBER_OF', fromEntityId: personEntityIds.aarav!, toEntityId: (await EntityModel.create({ orgId, type: 'team', name: 'Engineering', normalizedName: 'engineering', attributes: {}, sourceId: seedSourceId, createdBy: 'agent:seed' }))._id, sourceId: seedSourceId, createdBy: 'agent:seed', confidence: 1 });

  // Reporting line facts (temporal)
  await createFact({ orgId, entityId: personEntityIds.rahul!, predicate: 'role', value: 'Founder & CEO', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: personEntityIds.aarav!, predicate: 'role', value: 'Backend Developer', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: personEntityIds.neha!, predicate: 'role', value: 'Frontend Developer', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: personEntityIds.priya!, predicate: 'responsible_for', value: 'Design', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: personEntityIds.karan!, predicate: 'responsible_for', value: 'Marketing', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: personEntityIds.neha!, predicate: 'reports_to', value: 'Rahul Mehta', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });

  // Historical fact demonstrating temporal memory: Aarav USED to handle design-QA, no longer.
  const aaravQaFact = await createFact({ orgId, entityId: personEntityIds.aarav!, predicate: 'responsible_for', value: 'Design QA', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  void aaravQaFact;
  // (supersede intentionally left to a live message so the demo shows history in action)

  /* ── Goal + project ── */
  const goal = await GoalModel.create({ orgId, title: 'Launch the new Acme marketing website', description: 'Public site + signups + launch campaign', targetDate: daysFromNow(9), status: 'active' });
  const launch = daysFromNow(9, 17);
  const project = await ProjectModel.create({
    orgId,
    key: 'website-launch',
    name: 'Website Launch',
    description: 'Ship the new marketing website end-to-end: design, backend integration, frontend, campaign, launch review.',
    category: 'launch',
    status: 'active',
    health: 'at_risk',
    startDate: daysAgo(35),
    dueDate: launch,
    ownerUserId: userIds.rahul,
    goalId: goal._id,
  });
  await ProjectMembershipModel.create([
    { orgId, projectId: project._id, userId: userIds.rahul, role: 'sponsor' },
    { orgId, projectId: project._id, userId: userIds.aarav, role: 'member' },
    { orgId, projectId: project._id, userId: userIds.priya, role: 'member' },
    { orgId, projectId: project._id, userId: userIds.neha, role: 'member' },
    { orgId, projectId: project._id, userId: userIds.karan, role: 'lead' },
  ]);

  const projectEntity = await EntityModel.create({ orgId, type: 'project', name: 'Website Launch', normalizedName: 'website launch', attributes: { projectId: project._id, key: 'website-launch' }, sourceId: seedSourceId, createdBy: 'agent:seed', validFrom: daysAgo(35) });
  for (const key of ['aarav', 'priya', 'neha', 'karan']) {
    await createRelationship({ orgId, type: 'WORKS_ON', fromEntityId: personEntityIds[key]!, toEntityId: projectEntity._id, sourceId: seedSourceId, createdBy: 'agent:seed', confidence: 1 });
  }
  await createFact({ orgId, entityId: projectEntity._id, predicate: 'deadline', value: launch.toISOString().slice(0, 10), confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });
  await createFact({ orgId, entityId: projectEntity._id, predicate: 'status', value: 'active', confidence: 1, sourceId: seedSourceId, createdBy: 'agent:seed' });

  /* ── Milestones ── */
  const designFreeze = await MilestoneModel.create({ orgId, projectId: project._id, name: 'Design freeze', dueDate: daysFromNow(2), status: 'at_risk' });
  const codeComplete = await MilestoneModel.create({ orgId, projectId: project._id, name: 'Code complete', dueDate: daysFromNow(6), status: 'pending' });
  await MilestoneModel.create({ orgId, projectId: project._id, name: 'Public launch', dueDate: launch, status: 'pending' });
  void designFreeze; void codeComplete;

  /* ── Tasks ── */
  const mkTask = async (key: string, t: { title: string; description: string; assignee: string; status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'; priority: 'low' | 'medium' | 'high' | 'urgent'; dueInDays: number; category?: string }) => {
    const task = await TaskModel.create({
      orgId,
      projectId: project._id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      category: t.category ?? 'website-launch',
      dueDate: daysFromNow(t.dueInDays),
      reporterUserId: userIds.rahul,
      createdBy: { type: 'agent', id: 'seed', name: 'agent:seed' },
      sourceId: seedSourceId,
    });
    await TaskAssignmentModel.create({ orgId, taskId: task._id, userId: userIds[t.assignee], assignedBy: { type: 'agent', id: 'seed', name: 'agent:seed' }, method: 'direct', reason: 'Seeded assignment (demo)', active: true });
    await createRelationship({ orgId, type: 'HAS_TASK', fromEntityId: projectEntity._id, toEntityId: (await EntityModel.create({ orgId, type: 'task', name: t.title, normalizedName: normalizeName(t.title), attributes: { taskId: task._id, projectKey: 'website-launch' }, sourceId: seedSourceId, createdBy: 'agent:seed' }))._id, sourceId: seedSourceId, createdBy: 'agent:seed', confidence: 1 });
    const taskEntity = await EntityModel.findOne({ orgId, type: 'task', 'attributes.taskId': String(task._id) }).lean();
    if (taskEntity) await createRelationship({ orgId, type: 'OWNS', fromEntityId: personEntityIds[t.assignee]!, toEntityId: taskEntity._id, sourceId: seedSourceId, createdBy: 'agent:seed', confidence: 1 });
    return task;
  };

  const designTask = await mkTask('design', { title: 'Landing page design', description: 'Hero, pricing section, social proof, FAQ. Mobile-first.', assignee: 'priya', status: 'in_progress', priority: 'high', dueInDays: 3 });
  const apiTask = await mkTask('api', { title: 'Backend API integration', description: 'Wire form submissions + signup endpoint to the new site. Was due 2 days ago.', assignee: 'aarav', status: 'in_progress', priority: 'urgent', dueInDays: -2 });
  const frontendTask = await mkTask('frontend', { title: 'Frontend implementation', description: 'Build landing page in React, consume API, wire analytics.', assignee: 'neha', status: 'todo', priority: 'high', dueInDays: 4 });
  const marketingTask = await mkTask('marketing', { title: 'Marketing campaign', description: 'Launch campaign: email, social, SEO pages. Depends on site being live-ready.', assignee: 'karan', status: 'todo', priority: 'medium', dueInDays: 7 });
  const reviewTask = await mkTask('review', { title: 'Final launch review', description: 'Cross-functional sign-off: copy, design, performance, analytics, legal.', assignee: 'rahul', status: 'todo', priority: 'high', dueInDays: 8 });

  await TaskDependencyModel.create([
    { orgId, taskId: frontendTask._id, dependsOnTaskId: apiTask._id, kind: 'blocks' },
    { orgId, taskId: reviewTask._id, dependsOnTaskId: designTask._id, kind: 'blocks' },
    { orgId, taskId: reviewTask._id, dependsOnTaskId: frontendTask._id, kind: 'blocks' },
    { orgId, taskId: marketingTask._id, dependsOnTaskId: reviewTask._id, kind: 'needed_by' },
  ]);

  /* ── Decisions & meetings ── */
  const pricingDecisionSource = await SourceModel.create({ orgId, type: 'meeting', ref: 'meeting:pricing-review', authorName: 'Rahul Mehta', excerpt: 'Pricing: free tier + Pro at ₹999/mo, launch offer for first 100 customers.' });
  const pricingDecision = await DecisionModel.create({
    orgId,
    title: 'Pricing: free tier + Pro at ₹999/mo',
    summary: 'Launch with a generous free tier; Pro at ₹999/mo; first 100 customers get 3 months half price.',
    rationale: 'Maximize activation; pricing validated with 12 discovery calls.',
    projectId: project._id,
    decidedBy: ['Rahul Mehta', 'Karan Malhotra'],
    decidedAt: daysAgo(30),
    status: 'active',
    sourceId: pricingDecisionSource._id,
  });
  await DecisionModel.create({
    orgId,
    title: 'Launch date locked to this month',
    summary: 'Website launch locked; slipping is not acceptable without explicit escalation to the board.',
    rationale: 'Momentum + pipeline reviews depend on a live site.',
    projectId: project._id,
    decidedBy: ['Rahul Mehta'],
    decidedAt: daysAgo(9),
    status: 'active',
    sourceId: seedSourceId,
  });

  await MeetingModel.create({
    orgId,
    title: 'Website launch kickoff',
    kind: 'planning',
    occurredAt: daysAgo(35),
    durationMin: 45,
    attendeeUserIds: Object.values(userIds),
    attendeeNames: Object.values(people).map((p) => p.name),
    notes: 'Scope agreed: landing page + signup flow + launch campaign. Aarav owns API integration, Neha frontend, Priya design, Karan campaign, Rahul sign-off.',
    actionItems: ['Aarav: API integration by end of week', 'Priya: landing page design', 'Neha: React scaffold', 'Karan: campaign draft'],
  });

  /* ── Commitments ── */
  const cSeed = await SourceModel.create({ orgId, type: 'switch_room', ref: 'room:seed:kickoff', authorName: 'Aarav Sharma', excerpt: "I'll have the API spec to Neha by Wednesday." });
  await CommitmentModel.create({ orgId, ownerUserId: userIds.aarav, description: "Send the signup API spec to Neha", dueDate: daysFromNow(1), sourceId: cSeed._id, status: 'open', relatedTaskId: apiTask._id });
  await CommitmentModel.create({ orgId, ownerUserId: userIds.priya, description: 'Design system tokens (colour, type, spacing)', dueDate: daysAgo(2), sourceId: seedSourceId, status: 'done', relatedTaskId: designTask._id, completedAt: daysAgo(3) });

  /* ── A pending approval (agent-proposed, awaiting Rahul) — powers the Approvals page ── */
  await ApprovalModel.create({
    orgId,
    requesterType: 'agent',
    requesterName: 'agent:quality-risk',
    action: 'deadline_change',
    targetType: 'task',
    targetId: String(reviewTask._id),
    payload: { taskId: reviewTask._id, newDueDate: daysFromNow(9).toISOString(), reason: 'Launch review should sit on launch day, not before QA completes' },
    reason: 'Final launch review should happen on the launch date itself, after code complete and campaign QA.',
    impact: 'Keeps the review honest; moving earlier risks sign-off theatre without a working site.',
    status: 'pending',
  });

  /* ── Agent activity (demo-labelled) so the Agents page has honest content pre-live ── */
  await AgentActionModel.create([
    { orgId, agent: 'operations-manager', action: 'message_handled', outputSummary: 'Kickoff recap posted: owners, dates, deps confirmed in room.', at: daysAgo(35), demo: true },
    { orgId, agent: 'knowledge-memory', action: 'extraction', outputSummary: 'Captured: launch goal, owners, deadline fact, kickoff meeting, pricing decision source.', at: daysAgo(35), demo: true },
    { orgId, agent: 'quality-risk', action: 'scan_complete', outputSummary: 'API integration overdue by 2 days; frontend task blocked on it. Escalated to Rahul.', at: daysAgo(0), demo: true },
  ]);

  /* ── Recurring proactive jobs ── */
  await ensureRecurringJobs(orgId);

  /* ── Audit ── */
  await logAudit(orgId, { type: 'system', name: 'seed' }, 'seed.completed', { type: 'organization', id: orgId }, { org: 'Acme Technologies', people: 5, project: 'Website Launch' });

  console.log('[seed] done.');
  console.log(`       org: Acme Technologies (slug: acme) id=${orgId}`);
  console.log('       users: Rahul Mehta (owner) · Aarav Sharma · Priya Nair · Neha Iyer · Karan Malhotra');
  console.log('       project: Website Launch (key: website-launch) · 5 tasks · 4 dependencies');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => { console.error('[seed] failed', err); process.exit(1); });
