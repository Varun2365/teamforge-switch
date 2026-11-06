import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestOrg, testOrg } from './fixtures.js';
import { shouldRespond, extractAgentMentions, senderKindOf, isAgentIdentity } from '../src/integrations/switch/routing.js';
import { buildHandoffBody, parseHandoffBody } from '../src/integrations/switch/handoff.js';
import { respondAsAgent } from '../src/integrations/switch/agent-brain.js';
import { switchNameFor, type AgentKey } from '../src/integrations/switch/catalog.js';

const nameFor = (key: AgentKey) => switchNameFor(key, '-tf');

describe('Switch routing (no-mention entry, loop prevention)', () => {
  it('unaddressed human message is answered by the operations manager only', () => {
    for (const key of ['operations-manager', 'project-manager', 'knowledge-memory', 'communication', 'research-strategy', 'quality-risk'] as AgentKey[]) {
      expect(shouldRespond(key, 'human', false, [], false)).toBe(key === 'operations-manager');
    }
  });

  it('explicit mentions route only to the mentioned agent', () => {
    expect(shouldRespond('project-manager', 'human', true, ['project-manager'], false)).toBe(true);
    expect(shouldRespond('operations-manager', 'human', true, ['project-manager'], false)).toBe(false);
    expect(shouldRespond('quality-risk', 'human', true, ['quality-risk'], false)).toBe(true);
  });

  it('agent and system messages are never answered (no loops)', () => {
    for (const key of ['operations-manager', 'project-manager'] as AgentKey[]) {
      expect(shouldRespond(key, 'agent', false, [], false)).toBe(false);
      expect(shouldRespond(key, 'system', true, [], false)).toBe(false);
    }
    expect(senderKindOf({ sender_kind: 'agent' })).toBe('agent');
    expect(senderKindOf({ sender_kind: 'platform' })).toBe('system');
    expect(senderKindOf({})).toBe('human');
  });

  it('recognises agent identities and @mentions for suffix names', () => {
    expect(isAgentIdentity('project-manager')).toBe(true);
    expect(isAgentIdentity('Priya')).toBe(false);
    const mentions = extractAgentMentions('@project-manager-tf and @quality-risk-tf look at this', nameFor);
    expect(mentions).toEqual(expect.arrayContaining(['project-manager', 'quality-risk']));
  });

  it('handoff marker round-trips with registered names', () => {
    const body = buildHandoffBody({ fromAgentKey: 'operations-manager', toAgentKey: 'quality-risk', instruction: 'size the blast radius of the API slip' }, nameFor);
    expect(body).toContain('@quality-risk-tf');
    expect(body).toContain('TEAMFORGE_HANDOFF');
    const parsed = parseHandoffBody(body);
    expect(parsed).toEqual({ fromAgentKey: 'operations-manager', toAgentKey: 'quality-risk', instruction: 'size the blast radius of the API slip' });
  });
});

describe('agent brain (grounded, using real tools against the test DB)', () => {
  beforeAll(async () => { await setupTestDb(); await seedTestOrg(); });
  afterAll(teardownTestDb);

  const ask = (body: string) => respondAsAgent({
    organizationId: testOrg().orgId,
    agentKey: 'operations-manager',
    body,
    requesterId: testOrg().rahulId,
    requesterName: 'Rahul Mehta',
    requesterRole: 'owner',
    source: 'live',
  });

  it('answers "who knows TypeScript" from confirmed skills', async () => {
    const reply = await ask('who knows TypeScript?');
    expect(reply.body).toMatch(/Neha|Aarav/);
    expect(reply.toolsUsed).toContain('search_employees');
  });

  it('answers launch/overdue questions with the real overdue task and its blocker impact', async () => {
    const reply = await ask('what is slipping on the launch?');
    expect(reply.body).toContain('Backend API integration');
    expect(reply.body).toMatch(/overdue|late|slipp/i);
  });

  it('answers status questions with a grounded brief', async () => {
    const reply = await ask('give me a status update');
    expect(reply.body).toMatch(/overdue/i);
    expect(reply.body).toContain('Rahul');
  });

  it('produces a reminder when asked, with parsed due time', async () => {
    const reply = await ask('remind Aarav tomorrow at 10am to post the API ETA');
    expect(reply.body).toMatch(/remind|nudge|10:00/i);
    expect(reply.toolsUsed).toContain('create_reminder');
  });
});
