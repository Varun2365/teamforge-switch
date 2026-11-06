import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { UserModel, EmployeeProfileModel, SkillModel, EmployeeSkillModel } from '../db/models/org.js';
import { normalizeName } from '@teamforge/shared';
import { logAudit } from '../services/audit.js';
import { ensurePersonEntity, createFact, upsertAlias } from '../services/memoryService.js';
import { recordSource } from '../services/sourceService.js';

export function registerPeopleTools(reg: ToolRegistry) {
  reg.register({
    name: 'create_person',
    description: 'Add a teammate to the organization (creates their user record, profile, person entity, alias and optional skills). Use this whenever someone introduces a team member. Safe to call repeatedly: matches by name.',
    tier: 'write',
    input: z.object({
      name: z.string().min(2),
      role: z.enum(['owner', 'administrator', 'manager', 'team_lead', 'employee', 'external']).default('employee'),
      title: z.string().optional(),
      skills: z.array(z.string()).default([]),
      evidence: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const normalized = normalizeName(input.name);
      let user = await UserModel.findOne({ orgId, normalizedName: normalized });
      if (!user) {
        user = await UserModel.create({ orgId, name: input.name.trim(), normalizedName: normalized, role: input.role, status: 'active', metadata: { createdBy: actor.name } });
      } else if (input.role !== 'employee' || input.title) {
        await UserModel.updateOne({ orgId, _id: user._id }, { $set: { role: input.role } });
      }
      if (input.title) {
        await EmployeeProfileModel.updateOne({ orgId, userId: user._id }, { $set: { title: input.title }, $setOnInsert: { orgId, userId: user._id, joinedAt: new Date() } }, { upsert: true });
      } else {
        await EmployeeProfileModel.updateOne({ orgId, userId: user._id }, { $setOnInsert: { orgId, userId: user._id, joinedAt: new Date() } }, { upsert: true });
      }
      let sourceId: string | undefined;
      if (input.evidence) {
        const src = await recordSource({ orgId, type: 'manual', ref: `person:${user._id}`, authorName: actor.name, excerpt: input.evidence });
        sourceId = String(src._id);
      }
      const entity = await ensurePersonEntity(orgId, String(user._id), user.name, sourceId ?? null, actor.name);
      await upsertAlias(orgId, user.name, entity._id, 'person', sourceId ?? null, 0.99);
      for (const skill of input.skills) {
        const key = normalizeName(skill);
        if (!key) continue;
        const skillDoc = await SkillModel.findOneAndUpdate(
          { orgId, normalizedName: key },
          { $setOnInsert: { orgId, name: skill.trim(), normalizedName: key, category: 'general' } },
          { upsert: true, new: true },
        );
        await EmployeeSkillModel.updateOne({ orgId, userId: user._id, skillId: skillDoc._id }, { $set: { level: 3, confirmedBy: 'self' } }, { upsert: true });
      }
      await logAudit(orgId, actor, 'person.created', { type: 'user', id: String(user._id) }, { name: user.name, role: input.role });
      return { userId: String(user._id), name: user.name, role: input.role, title: input.title ?? null, skills: input.skills };
    },
  });

  reg.register({
    name: 'update_person',
    description: 'Update a teammate\'s org profile: role (owner/administrator/manager/team_lead/employee/external), title, manager, location, or their TeamForge display name. Use role facts for seniority changes too.',
    tier: 'write',
    input: z.object({
      userId: z.string(),
      role: z.enum(['owner', 'administrator', 'manager', 'team_lead', 'employee', 'external']).optional(),
      title: z.string().optional(),
      managerUserId: z.string().optional(),
      location: z.string().optional(),
      name: z.string().optional(),
    }),
    handler: async ({ orgId, actor }, input) => {
      const user = await UserModel.findOne({ orgId, _id: input.userId });
      if (!user) throw new Error('Person not found');
      const patch: Record<string, unknown> = {};
      if (input.role) patch.role = input.role;
      if (input.name) { patch.name = input.name; patch.normalizedName = normalizeName(input.name); }
      await UserModel.updateOne({ orgId, _id: input.userId }, { $set: patch });
      const profileSet: Record<string, unknown> = {};
      if (input.title) profileSet.title = input.title;
      if (input.managerUserId) profileSet.managerUserId = input.managerUserId;
      if (input.location) profileSet.location = input.location;
      if (Object.keys(profileSet).length) {
        await EmployeeProfileModel.updateOne({ orgId, userId: input.userId }, { $set: profileSet }, { upsert: true });
      }
      await logAudit(orgId, actor, 'person.updated', { type: 'user', id: input.userId }, input);
      return { updated: true, userId: input.userId, name: input.name ?? user.name, role: input.role ?? user.role };
    },
  });

  reg.register({
    name: 'set_employee_skill',
    description: 'Record a skill for a teammate (creates the skill if new). Use this for "X knows React" or experience statements so skill searches work.',
    tier: 'write',
    input: z.object({
      userId: z.string(),
      skill: z.string().min(1),
      level: z.number().int().min(1).max(5).default(3),
      evidence: z.string().optional().describe('What the person said, for provenance'),
    }),
    handler: async ({ orgId, actor }, input) => {
      const user = await UserModel.findOne({ orgId, _id: input.userId }).lean();
      if (!user) throw new Error('Person not found');
      const normalized = normalizeName(input.skill);
      const skill = await SkillModel.findOneAndUpdate(
        { orgId, normalizedName: normalized },
        { $setOnInsert: { orgId, name: input.skill.trim(), normalizedName: normalized, category: 'general' } },
        { upsert: true, new: true },
      );
      await EmployeeSkillModel.updateOne(
        { orgId, userId: input.userId, skillId: skill._id },
        { $set: { level: input.level, confirmedBy: 'self' } },
        { upsert: true },
      );
      let sourceId: string | undefined;
      if (input.evidence) {
        const src = await recordSource({ orgId, type: 'manual', ref: `skill:${Date.now()}`, authorName: actor.name, excerpt: input.evidence });
        sourceId = String(src._id);
      }
      try {
        const entity = await ensurePersonEntity(orgId, input.userId, user.name, sourceId ?? null, actor.name);
        await createFact({ orgId, entityId: entity._id, predicate: 'skill', value: input.skill.trim(), confidence: 0.95, sourceId: sourceId ?? null, createdBy: actor.name, allowSystem: !sourceId });
      } catch { /* graph optional */ }
      await logAudit(orgId, actor, 'person.skill.recorded', { type: 'user', id: input.userId }, { skill: input.skill, level: input.level });
      return { updated: true, userId: input.userId, name: user.name, skill: skill.name, level: input.level };
    },
  });
}
