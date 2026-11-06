import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { OrganizationModel, UserModel } from '../../db/models/org.js';
import { RoomMappingModel, NotificationModel } from '../../db/models/comms.js';
import { MessageModel, ConversationModel, SwitchStateModel } from '../../db/models/switch.js';
import { recordSource } from '../../services/sourceService.js';
import { recordEvent, logAgentAction, logAudit } from '../../services/audit.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { AGENT_CATALOG, isAgentKey, switchNameFor, type AgentKey } from './catalog.js';
import { SwitchClient, SwitchApiError, openSwitchAgentAddressing, registerSwitchAgent, newConnectionId, type SwitchFrame, type SwitchClientHandlers } from './switch-client.js';
import { SwitchCredentialStore, type SwitchCredentials } from './credential-store.js';
import { parseHandoffBody, buildHandoffBody } from './handoff.js';
import { shouldRespond, senderKindOf, isAgentIdentity, extractAgentMentions, normalizeName, type SenderKind } from './routing.js';
import { respondAsAgent, chooseAgent } from './agent-brain.js';
import { askTeamForgeAI, ensureBrainConfig } from './ai-brain.js';
import { getOrganizationOverview } from '../../services/orgService.js';
import { getOverdueTasks, searchTasks } from '../../services/taskService.js';
import { getPendingApprovals } from '../../services/approvalService.js';
import { ProjectModel, DecisionModel } from '../../db/models/ops.js';
import { EmployeeProfileModel } from '../../db/models/org.js';
import { ensurePersonEntity, upsertAlias } from '../../services/memoryService.js';
import { buildToolRegistry } from '../../tools/index.js';

interface RuntimeAgent {
  key: AgentKey;
  catalog: (typeof AGENT_CATALOG)[number];
  client?: SwitchClient;
  status: string;
  lastError?: string;
}

export interface RuntimeStatus {
  configured: boolean;
  running: boolean;
  roomId: string | null;
  roomName: string;
  onlineAgents: number;
  agents: Array<{ key: AgentKey; name: string; switchName: string; role: string; status: string; connected: boolean; switchAgentId?: string;rooms: string[]; lastError?: string }>;
  lastError: string | null;
  updatedAt: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isDup = (e: unknown) => (e as { code?: number | string })?.code === 11000 || String((e as Error)?.message ?? '').includes('E11000');

function messageTimestamp(value: unknown): Date {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return new Date(n < 10_000_000_000 ? n * 1000 : n);
  return new Date();
}

class SwitchRuntime {
  readonly organizationId: string;
  private readonly baseUrl = config.SWITCH_SERVER_URL.replace(/\/+$/, '');
  private readonly store = new SwitchCredentialStore(config.SWITCH_CREDENTIALS_PATH);
  private readonly agents = new Map<AgentKey, RuntimeAgent>();
  private readonly roomQueues = new Map<string, Promise<void>>();
  private readonly participantCache = new Map<string, { at: number; names: string[] }>();
  private users: Array<{ _id: string; name: string; role: string; email?: string | null }> = [];
  private owner: { _id: string; name: string; role: string; email?: string | null } | null = null;
  private credentials: Record<string, SwitchCredentials> = {};
  private roomId: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private stopping = false;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    for (const catalog of AGENT_CATALOG) this.agents.set(catalog.key, { key: catalog.key, catalog, status: 'offline' });
  }

  get configured(): boolean { return Boolean(config.SWITCH_REGISTRATION_TOKEN); }
  get primaryRoomId(): string | null { return this.roomId; }
  private suffix(): string { return config.SWITCH_AGENT_SUFFIX; }
  private nameFor(key: AgentKey) { return switchNameFor(key, this.suffix()); }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopping = false;

    const org = await OrganizationModel.findById(this.organizationId).lean();
    if (!org) { this.running = false; throw new Error(`Organization '${this.organizationId}' not found`); }
    ensureBrainConfig();

    this.users = (await UserModel.find({ orgId: this.organizationId, status: 'active' }).lean()).map((u) => ({ _id: u._id, name: u.name, role: u.role, email: u.email ?? null }));
    this.owner = this.users.find((u) => u.role === 'owner') ?? this.users[0] ?? null;

    if (!this.configured || !config.SWITCH_AUTO_CONNECT) {
      const reason = this.configured ? 'Switch auto-connect disabled' : 'SWITCH_REGISTRATION_TOKEN not configured';
      logger.info({ organizationId: this.organizationId }, `${reason} — running without live Switch`);
      for (const agent of this.agents.values()) await this.persistAgentStatus(agent, 'offline', undefined);
      await this.persistIntegration('disconnected', reason);
      return;
    }

    try {
      await this.persistIntegration('connecting', undefined);
      this.credentials = await this.store.load(this.baseUrl);

      for (const agent of this.agents.values()) {
        try {
          const credentials = await this.ensureCredential(agent);
          agent.client = this.buildClient(agent, credentials);
        } catch (error) {
          agent.status = 'error';
          agent.lastError = error instanceof Error ? error.message : String(error);
          await this.persistAgentStatus(agent, 'error', agent.lastError);
          logger.error({ agent: agent.key, error: agent.lastError }, 'Switch agent registration failed');
        }
      }

      const connected = [...this.agents.values()].filter((a) => a.client);
      for (const agent of connected) await agent.client!.start();
      await Promise.allSettled(connected.map((a) => a.client!.waitForConnection(20_000)));

      if (config.SWITCH_AUTO_PROVISION) await this.ensureRoom();
      else if (org.settings?.switchRoomIds) this.roomId = String(org.settings.switchRoomIds);

      const online = [...this.agents.values()].filter((a) => a.client?.isConnected).length;
      await this.persistIntegration(online > 0 ? 'connected' : 'error', online > 0 ? undefined : this.lastError ?? 'No agents connected');
      logger.info({ organizationId: this.organizationId, roomId: this.roomId, online }, 'Switch runtime started');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      await this.persistIntegration('error', this.lastError ?? undefined);
      logger.error({ error: this.lastError }, 'Switch runtime failed to start');
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.running = false;
    for (const agent of this.agents.values()) {
      agent.client?.stop();
      agent.status = 'offline';
      await this.persistAgentStatus(agent, 'offline', undefined);
    }
    await this.persistIntegration('disconnected', 'runtime stopped');
  }

  async deliverProactive(input: { title: string; body: string; mentionNames?: string[]; mentionUserIds?: string[]; roomId?: string }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.configured) return { ok: false, error: 'Switch not configured' };
    try {
      const preferred = chooseAgent(`${input.title} ${input.body}`, 'operations-manager');
      const mentionNames = [...(input.mentionNames ?? [])];
      if (input.mentionUserIds?.length) mentionNames.push(...(await this.participantNamesForUsers(input.mentionUserIds)));
      const messageId = await this.postAsAgent(preferred, `**${input.title}**\n\n${input.body}`, { targetNames: mentionNames, roomId: input.roomId ?? this.roomId ?? undefined });
      return { ok: true, messageId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Map TeamForge user ids → the participant names the room actually knows (for real @mentions). */
  private async participantNamesForUsers(userIds: string[]): Promise<string[]> {
    const entry = this.pickEntry('operations-manager');
    if (!entry?.client) return [];
    try {
      await entry.client.waitForConnection(10_000);
      const participants = await entry.client.listParticipants();
      const names = new Set<string>();
      for (const userId of userIds) {
        const user = await UserModel.findOne({ orgId: this.organizationId, _id: userId }).lean();
        if (!user) continue;
        const switchId = (user.metadata as { switchParticipantId?: string } | undefined)?.switchParticipantId;
        const match = participants.find((p: any) => (switchId && p.id === switchId))
          ?? participants.find((p: any) => [p.name, p.alias].filter(Boolean).some((v: string) => normalizeName(v) === normalizeName(user.name) || normalizeName(v).includes(normalizeName(user.name)) || normalizeName(user.name).includes(normalizeName(v))));
        if (match?.name) names.add(String(match.name));
      }
      return [...names];
    } catch {
      return [];
    }
  }

  getStatus(): RuntimeStatus {
    const agents = [...this.agents.values()].map((agent) => {
      const state = agent.client?.state;
      return {
        key: agent.key,
        name: agent.catalog.name,
        switchName: agent.client?.switchName ?? this.nameFor(agent.key),
        role: agent.catalog.role,
        status: agent.status,
        connected: Boolean(state?.connected),
        switchAgentId: agent.client?.agentId,
        rooms: state?.rooms ?? [],
        lastError: state?.lastError ?? agent.lastError,
      };
    });
    return {
      configured: this.configured,
      running: this.running,
      roomId: this.roomId,
      roomName: config.SWITCH_ROOM_NAME,
      onlineAgents: agents.filter((a) => a.connected).length,
      agents,
      lastError: this.lastError,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildClient(agent: RuntimeAgent, credentials: SwitchCredentials): SwitchClient {
    const client = new SwitchClient(this.baseUrl, credentials, {
      onConnected: () => this.handleConnected(agent),
      onDisconnected: (reason) => this.handleDisconnected(agent, reason),
      onFrame: (frame) => this.handleFrame(agent, frame),
      onError: (error) => { agent.lastError = error.message; },
    } as SwitchClientHandlers);
    return client;
  }

  private agentActor(agent: RuntimeAgent): string {
    return `agent:${agent.catalog.switchName}${this.suffix()}`;
  }

  /** True when a sender name belongs to one of OUR registered agents (suffix included). */
  private knownAgentName(name: string): boolean {
    const wanted = normalizeName(name);
    if (!wanted) return false;
    return AGENT_CATALOG.some((a) => {
      const registered = normalizeName(this.nameFor(a.key));
      return wanted === registered || wanted === normalizeName(a.key) || wanted === normalizeName(a.name);
    });
  }

  private async handleConnected(agent: RuntimeAgent): Promise<void> {
    agent.status = 'online';
    agent.lastError = undefined;
    await this.persistAgentStatus(agent, 'online', undefined);
    await this.touchAgentState(agent, true);
    await logAgentAction(this.organizationId, this.agentActor(agent), 'connected', {
      detail: { agent: agent.key, switchAgentId: agent.client?.agentId },
      outputSummary: `${agent.catalog.name} connected to Switch`,
    });
    if (this.roomId && !this.stopping) {
      void this.ensureAgentInRoom(agent, this.roomId, true).catch((error) => { agent.lastError = error instanceof Error ? error.message : String(error); });
    }
    await this.persistIntegration('connected', undefined);
  }

  private async handleDisconnected(agent: RuntimeAgent, reason: string): Promise<void> {
    if (this.stopping) return;
    agent.status = 'reconnecting';
    agent.lastError = reason;
    await this.persistAgentStatus(agent, 'reconnecting', reason);
    await this.touchAgentState(agent, false, reason);
    await logAgentAction(this.organizationId, this.agentActor(agent), 'disconnected', { error: reason, outputSummary: `${agent.catalog.name} lost its Switch connection` });
    await this.persistIntegration('reconnecting', reason);
  }

  private async handleFrame(agent: RuntimeAgent, frame: SwitchFrame): Promise<void> {
    const data = (frame.data ?? {}) as Record<string, any>;
    if (frame.event === 'message') {
      const roomId = String(data.room_id ?? data.payload?.room_id ?? '');
      if (!roomId) return;
      await this.enqueueRoom(roomId, () => this.ingestMessage(agent, data)).catch((error) => {
        logger.error({ error: error instanceof Error ? error.message : String(error), agent: agent.key }, 'message ingest failed (kept the runtime alive)');
      });
      return;
    }
    if (frame.event === 'room_join') {
      this.participantCache.delete(String(data.room_id ?? ''));
      return;
    }
    if (frame.event === 'gap') {
      logger.warn({ agent: agent.key }, 'Switch stream gap');
      return;
    }
    if (frame.event === 'connection_state') {
      await this.touchAgentState(agent, Boolean(agent.client?.isConnected), undefined, data);
    }
  }

  private enqueueRoom(roomId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.roomQueues.get(roomId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.roomQueues.set(roomId, current);
    return current.finally(() => {
      if (this.roomQueues.get(roomId) === current) this.roomQueues.delete(roomId);
    });
  }

  private async ingestMessage(agent: RuntimeAgent, event: Record<string, any>): Promise<void> {
    const payload = (event?.payload ?? {}) as Record<string, any>;
    const body = String(payload.body ?? '').trim();
    if (!body || body.startsWith('!')) return;
    const roomId = String(event.room_id ?? payload.room_id ?? '');
    if (!roomId) return;

    const switchMessageId = String(payload.message_id ?? event?.message_id ?? createHash('sha1').update(`${roomId}:${payload.timestamp}:${body}`).digest('hex'));

    let senderKind = senderKindOf(payload);
    if (!payload.sender_kind && (isAgentIdentity(String(payload.sender_name ?? '')) || this.knownAgentName(String(payload.sender_name ?? '')))) senderKind = 'agent';
    const senderName = String(payload.sender_name ?? payload.sender ?? 'Unknown');
    const addressed = Boolean(payload.addressed);
    const genericMentions = [...body.matchAll(/@([\w.-]+)/g)].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i);
    const mentions = extractAgentMentions(body, (key) => this.nameFor(key));
    const threadId = payload.thread_id ? String(payload.thread_id) : undefined;
    const sentAt = messageTimestamp(payload.timestamp);
    const handoff = parseHandoffBody(body);
    const handoffForMe = senderKind === 'agent' && handoff?.toAgentKey === agent.key;
    if (senderKind === 'agent' && handoff && !handoffForMe) return;
    const processingBody = handoffForMe ? handoff!.instruction : body;

    await this.touchAgentState(agent, Boolean(agent.client?.isConnected));

    const sender = await this.resolveOrCreateSender(senderName, String(payload.sender ?? ''), sentAt);
    let message = await MessageModel.findOne({ orgId: this.organizationId, switchMessageId }).lean();
    let created = false;

    if (!message) {
      const conversation = await this.touchConversation(roomId, senderName, sentAt);
      const source = await this.recordMessageSource({ switchMessageId, roomId, body, sender, senderName, sentAt, threadId, conversationId: String(conversation?._id ?? '') });
      try {
        message = await MessageModel.create({
          orgId: this.organizationId,
          roomId,
          switchMessageId,
          sourceId: source?._id ? String(source._id) : undefined,
          senderId: sender?._id ? String(sender._id) : undefined,
          senderName,
          senderKind,
          body: body.slice(0, 20_000),
          addressedTo: [
            ...new Set([
              ...genericMentions,
              ...(handoffForMe ? [agent.client?.switchName ?? this.nameFor(agent.key)] : []),
              ...(addressed && !genericMentions.length && !mentions.length ? [agent.client?.switchName ?? this.nameFor(agent.key)] : []),
            ]),
          ],
          addressed: addressed || mentions.length > 0 || handoffForMe,
          isProcessed: senderKind !== 'human' && !handoffForMe,
          threadId,
          sentAt,
        });
        created = true;
      } catch (error) {
        if (!isDup(error)) throw error;
        message = await MessageModel.findOne({ orgId: this.organizationId, switchMessageId }).lean();
        if (!message) return;
      }
    }

    if (created) {
      await RoomMappingModel.updateOne({ orgId: this.organizationId, switchRoomId: roomId }, { $set: { lastSeenAt: new Date() } });
      if (senderKind === 'human') {
        void recordEvent(this.organizationId, 'message.received', { messageId: message._id, roomId, senderName, addressed, bodyPreview: body.slice(0, 240) });
      }
    }

    if (!shouldRespond(agent.key, senderKind, addressed, mentions, handoffForMe)) return;
    if (!config.SWITCH_AUTO_ROUTE) return;

    const claimed = await MessageModel.findOneAndUpdate(
      { orgId: this.organizationId, _id: message._id, isProcessed: false },
      { $set: { isProcessed: true, processingResult: { status: 'processing', agentKey: agent.key, claimedAt: new Date().toISOString() } } },
      { new: true },
    ).lean();
    if (!claimed) return;

    const replyAgent = this.pickEntry(agent.key);
    if (!replyAgent?.client) {
      await this.finishMessage(message._id, { status: 'error', error: 'No Switch agent is connected' });
      return;
    }

    const started = Date.now();
    try {
      const reply = await this.composeReply(replyAgent, {
        roomId,
        message: processingBody,
        sender,
        senderName,
        switchMessageId,
        addressed: addressed || mentions.length > 0,
        handoffForMe,
      });

      let sentMessageId = '';
      try {
        const targets = !handoffForMe && (addressed || mentions.length)
          ? this.resolveParticipantNames([senderName], await this.getParticipantNames(replyAgent, roomId))
          : [];
        if (targets.length) {
          const result = await replyAgent.client.sendTargetedMessage(reply.body, targets, threadId);
          sentMessageId = String(result?.event_id ?? result?.message_id ?? result?.id ?? '');
        } else {
          sentMessageId = await replyAgent.client.postMessage(reply.body, threadId);
        }
      } catch (error) {
        logger.warn({ roomId, agent: replyAgent.key, error: error instanceof Error ? error.message : String(error) }, 'targeted Switch reply failed; broadcasting instead');
        sentMessageId = await replyAgent.client.postMessage(reply.body, threadId);
      }

      let handoffMessageId: string | undefined;
      if (reply.handoff) {
        try {
          handoffMessageId = await replyAgent.client.postMessage(buildHandoffBody(reply.handoff, (k) => this.nameFor(k)), threadId);
          await logAgentAction(this.organizationId, this.agentActor(replyAgent), 'handoff', {
            roomId,
            detail: { toAgent: reply.handoff.toAgentKey, instruction: reply.handoff.instruction.slice(0, 300) },
            outputSummary: `Handoff to ${this.nameFor(reply.handoff.toAgentKey)}`,
          });
        } catch (error) {
          logger.warn({ roomId, agent: replyAgent.key }, 'Switch handoff message failed');
        }
      }

      await this.finishMessage(message._id, {
        status: 'replied',
        agentKey: replyAgent.key,
        reply: reply.body,
        toolsUsed: reply.toolsUsed,
        brain: reply.source,
        durationMs: Date.now() - started,
        sentMessageId,
        handoffAgentKey: reply.handoff?.toAgentKey,
        handoffMessageId,
        repliedAt: new Date().toISOString(),
      });
      await logAgentAction(this.organizationId, this.agentActor(replyAgent), 'posted_message', {
        roomId,
        inputSummary: body.slice(0, 300),
        outputSummary: reply.body.replace(/\s+/g, ' ').slice(0, 300),
        durationMs: Date.now() - started,
        detail: { tools: reply.toolsUsed, handoff: reply.handoff?.toAgentKey, brain: reply.source },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.finishMessage(message._id, { status: 'error', error: detail });
      await logAgentAction(this.organizationId, this.agentActor(replyAgent), 'reply_failed', { roomId, error: detail, durationMs: Date.now() - started });
      logger.error({ roomId, agent: replyAgent.key, error: detail }, 'Switch agent reply failed');
    }
  }

  async postAsAgent(agentKey: AgentKey, body: string, options: { targetNames?: string[]; threadId?: string; roomId?: string } = {}): Promise<string> {
    const entry = this.pickEntry(agentKey);
    const roomId = options.roomId ?? this.roomId ?? undefined;
    if (!entry?.client) throw new Error(`Switch agent ${agentKey} is not available`);
    if (roomId) await this.ensureAgentInRoom(entry, roomId);
    await entry.client.waitForConnection(10_000);
    if (options.targetNames?.length) {
      const names = this.resolveParticipantNames(options.targetNames, await this.getParticipantNames(entry, roomId));
      if (names.length) {
        const result = await entry.client.sendTargetedMessage(body, names, options.threadId);
        return String(result?.event_id ?? result?.message_id ?? result?.id ?? '');
      }
    }
    return entry.client.postMessage(body, options.threadId);
  }

  private pickEntry(preferred: AgentKey): RuntimeAgent | undefined {
    const direct = this.agents.get(preferred);
    if (direct?.client?.isConnected) return direct;
    return [...this.agents.values()].find((a) => a.client?.isConnected);
  }

  private async ensureAgentInRoom(agent: RuntimeAgent, roomId: string, invite = false): Promise<void> {
    if (!agent.client) throw new Error(`Switch agent ${agent.key} is not configured`);
    await agent.client.waitForConnection(15_000);
    if (agent.client.state.rooms.includes(roomId)) return;
    try {
      await agent.client.connectToRoom(roomId);
      this.participantCache.delete(roomId);
    } catch (error) {
      if (!invite) throw error;
      const inviter = this.pickEntry(agent.key === 'operations-manager' ? 'project-manager' : 'operations-manager');
      if (!inviter?.client || inviter.key === agent.key) throw error;
      await inviter.client.inviteAgent(roomId, agent.client.switchName);
      await sleep(400);
      await agent.client.connectToRoom(roomId);
      this.participantCache.delete(roomId);
    }
  }

  private async ensureRoom(): Promise<void> {
    const connected = [...this.agents.values()].filter((a) => a.client?.isConnected);
    const operations = connected.find((a) => a.key === 'operations-manager') ?? connected[0];
    if (!operations?.client) {
      this.lastError = 'No Switch agent connected; room provisioning skipped';
      return;
    }

    const org = await OrganizationModel.findById(this.organizationId).lean();
    const mapping = await RoomMappingModel.findOne({ orgId: this.organizationId, name: config.SWITCH_ROOM_NAME, purpose: 'lobby' }).lean();
    let roomId: string | null = mapping?.switchRoomId ?? null;

    if (roomId) {
      try {
        await operations.client.connectToRoom(roomId);
        this.participantCache.delete(roomId);
      } catch {
        logger.warn({ roomId }, 'stored Switch room unavailable; provisioning a replacement');
        roomId = null;
      }
    }

    if (!roomId) {
      try {
        const rooms = await operations.client.listRooms();
        const match = rooms.find((r: any) => String(r.name ?? '').trim().toLowerCase() === config.SWITCH_ROOM_NAME.trim().toLowerCase());
        if (match) {
          roomId = String(match.room_id ?? match.id);
          await operations.client.connectToRoom(roomId);
        }
      } catch (error) {
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'could not list Switch rooms');
      }
    }

    if (!roomId) {
      const created = await this.createOperationsRoom(operations);
      if (!created) {
        this.lastError = 'Could not provision the Switch operations room';
        return;
      }
      roomId = String(created.id ?? created.room_id ?? created.roomId);
    }

    this.roomId = roomId;
    const bridge = await this.readRoomBridge(operations, roomId);

    for (const agent of connected) {
      try {
        await this.ensureAgentInRoom(agent, roomId, true);
      } catch (error) {
        agent.status = 'error';
        agent.lastError = error instanceof Error ? error.message : String(error);
        await this.persistAgentStatus(agent, 'error', agent.lastError);
        logger.error({ agent: agent.key, roomId, error: agent.lastError }, 'could not bind agent to the operations room');
      }
    }

    await RoomMappingModel.updateOne(
      { orgId: this.organizationId, switchRoomId: roomId },
      {
        $set: {
          name: config.SWITCH_ROOM_NAME,
          purpose: 'lobby',
          visibility: bridge.internal ? 'private' : 'public',
          agentNames: connected.map((a) => a.client?.switchName ?? this.nameFor(a.key)),
          discordChannelId: bridge.externalChannelId ?? undefined,
          metadata: { bridge, instructions: config.SWITCH_ROOM_DESCRIPTION },
        },
        $setOnInsert: { orgId: this.organizationId },
      },
      { upsert: true },
    );
    await OrganizationModel.updateOne({ _id: this.organizationId }, { $set: { 'settings.switchRoomIds': roomId } });

    logger.info({ roomId, bridge }, 'Switch operations room ready');
  }

  private async readRoomBridge(agent: RuntimeAgent, roomId: string): Promise<{ internal: boolean; bridgeId: string | null; externalChannelId: string | null; channelType: string | null; connectedUserNames: string[] }> {
    try {
      const detail = await agent.client!.getRoomDetail(roomId);
      return {
        internal: !detail?.bridge_id,
        bridgeId: detail?.bridge_id ? String(detail.bridge_id) : null,
        externalChannelId: detail?.external_channel_id ? String(detail.external_channel_id) : null,
        channelType: detail?.channel_type ? String(detail.channel_type) : null,
        connectedUserNames: Array.isArray(detail?.connected_user_names) ? detail.connected_user_names.map(String) : [],
      };
    } catch {
      return { internal: true, bridgeId: null, externalChannelId: null, channelType: null, connectedUserNames: [] };
    }
  }

  private async createOperationsRoom(inviter: RuntimeAgent): Promise<any | null> {
    if (!inviter.client) return null;
    const agentNames = [...this.agents.values()].filter((a) => a.client?.isConnected).map((a) => a.client!.switchName);
    let bridgeId = config.SWITCH_BRIDGE_ID || '';
    if (!bridgeId && !config.SWITCH_INTERNAL_ONLY) {
      const bridges = await inviter.client.listBridges().catch(() => []);
      logger.info({ bridges: bridges.map((b: any) => ({ id: b.id, type: b.type, status: b.status, default: b.is_default, canCreate: b.can_create_channels })) }, 'Switch bridges available');
      const usable = bridges.filter((b: any) => b.status === 'active' && b.can_create_channels !== false);
      const selected = usable.find((b: any) => /discord/i.test(String(b.type))) ?? usable.find((b: any) => b.is_default) ?? usable[0];
      bridgeId = selected?.id ? String(selected.id) : '';
    }
    const base = {
      name: config.SWITCH_ROOM_NAME,
      description: config.SWITCH_ROOM_DESCRIPTION,
      agentNames,
      userNames: config.SWITCH_USER_NAMES,
      instructions: this.roomInstructions(),
    };
    try {
      const created = await inviter.client.createRoom({ ...base, internalOnly: config.SWITCH_INTERNAL_ONLY, ...(bridgeId && !config.SWITCH_INTERNAL_ONLY ? { bridgeId, channelType: config.SWITCH_CHANNEL_TYPE } : {}) });
      return created;
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'external room creation failed; retrying internal-only');
      try {
        return await inviter.client.createRoom({ ...base, internalOnly: true });
      } catch (retryError) {
        logger.error({ error: retryError instanceof Error ? retryError.message : String(retryError) }, 'Switch room creation failed');
        return null;
      }
    }
  }

  private roomInstructions(): string {
    return [
      `This is the TEAMFORGE operations room for ${config.ORG_SLUG}.`,
      'People and AI agents work together here. Say anything — no commands and no @mentions needed; the Operations Manager picks up unaddressed requests.',
      'If you do want a specialist directly: @ops-manager, @project-manager, @knowledge-memory, @communication, @research-strategy, @quality-risk.',
      'Agents can propose tasks, ownership, deadline, memory or external-message changes, but material changes wait for a human approval.',
      'Keep the room calm: one agent answers at a time; specialists work behind the Operations Manager.',
    ].join('\n');
  }

  private async ensureCredential(agent: RuntimeAgent): Promise<SwitchCredentials> {
    const switchName = this.nameFor(agent.key);
    let existing: SwitchCredentials | undefined = this.credentials[agent.key];
    if (existing && existing.switchName !== switchName) {
      delete this.credentials[agent.key];
      await this.store.remove(this.baseUrl, agent.key);
      existing = undefined;
    }
    if (existing) {
      const probe = new SwitchClient(this.baseUrl, existing);
      try {
        await probe.listRooms();
        await this.ensureAddressingOpen(existing.agentId);
        return existing;
      } catch (error) {
        if (error instanceof SwitchApiError && [401, 403, 404].includes(error.status)) {
          logger.warn({ agent: agent.key }, 'stored Switch credential invalid; re-registering');
          delete this.credentials[agent.key];
          await this.store.remove(this.baseUrl, agent.key);
        } else {
          throw error;
        }
      }
    }
    const payload = this.registrationPayload(agent, switchName);
    let result: { id: string; api_key: string };
    try {
      result = await registerSwitchAgent(this.baseUrl, config.SWITCH_REGISTRATION_TOKEN, payload);
    } catch (error) {
      if (error instanceof SwitchApiError && error.status === 409) {
        // Name exists (e.g. an earlier build). A distinct SWITCH_AGENT_SUFFIX avoids this;
        // if the operator opted into the same names, overwrite is the documented re-register path.
        result = await registerSwitchAgent(this.baseUrl, config.SWITCH_REGISTRATION_TOKEN, { ...payload, overwrite: true });
      } else {
        throw error;
      }
    }
    const credentials = await this.store.upsert(this.baseUrl, agent.key, {
      key: agent.key,
      switchName,
      displayName: agent.catalog.name,
      agentId: result.id,
      apiKey: result.api_key,
      connectionId: newConnectionId(),
      registeredAt: new Date().toISOString(),
    });
    this.credentials[agent.key] = credentials;
    await this.ensureAddressingOpen(result.id);
    await logAgentAction(this.organizationId, this.agentActor(agent), 'registered', { detail: { switchName, agentId: result.id }, outputSummary: `Registered ${switchName} with Switch` });
    return credentials;
  }

  private async ensureAddressingOpen(agentId: string): Promise<void> {
    if (!config.SWITCH_GATEWAY_EMAIL || !config.SWITCH_GATEWAY_PASSWORD) return;
    try {
      await openSwitchAgentAddressing(this.baseUrl, agentId, config.SWITCH_GATEWAY_EMAIL, config.SWITCH_GATEWAY_PASSWORD);
    } catch (error) {
      logger.warn({ agentId, error: error instanceof Error ? error.message : String(error) }, 'could not open Switch agent addressing');
    }
  }

  private registrationPayload(agent: RuntimeAgent, switchName: string): Record<string, unknown> {
    // Switch requires every advertised tool to carry a description.
    const descriptions = new Map(buildToolRegistry().describe().map((t) => [t.name, t.description]));
    const tools = agent.catalog.tools.map((name) => ({ name, description: descriptions.get(name) ?? `${name} (TEAMFORGE capability)` }));
    return {
      name: switchName,
      display_name: agent.catalog.name,
      description: `${agent.catalog.description} Operates for ${config.ORG_SLUG}.`,
      connector_type: 'external',
      integration_profile: {
        connection_model: 'always_on',
        message_exchange: true,
        pre_invocation_mediation: [],
        post_invocation_mediation: [],
        event_reporting: [],
      },
      tools,
      metadata: { source: 'teamforge', agentKey: agent.key, organizationId: this.organizationId },
      overwrite: false,
    };
  }

  private resolveSender(senderName: string): { _id: string; name: string; role: string; email?: string | null } | null {
    const value = normalizeName(senderName);
    if (!value) return this.owner;
    const exact = this.users.find((u) => normalizeName(u.name) === value || normalizeName(String(u.email ?? '')) === value);
    if (exact) return exact;
    return this.users.find((u) => normalizeName(u.name).length > 2 && (value.includes(normalizeName(u.name)) || normalizeName(u.name).includes(value))) ?? this.owner;
  }

  private async touchConversation(roomId: string, senderName: string, sentAt: Date) {
    try {
      return await ConversationModel.findOneAndUpdate(
        { orgId: this.organizationId, roomId },
        {
          $setOnInsert: { orgId: this.organizationId, roomId, switchRoomId: roomId, platform: 'switch', title: config.SWITCH_ROOM_NAME },
          $set: { lastMessageAt: sentAt },
          $addToSet: { participants: senderName },
        },
        { upsert: true, new: true },
      ).lean();
    } catch (error) {
      if (!isDup(error)) throw error;
      return ConversationModel.findOne({ orgId: this.organizationId, roomId }).lean();
    }
  }

  private async recordMessageSource(input: { switchMessageId: string; roomId: string; body: string; sender: { _id: string; name: string } | null; senderName: string; sentAt: Date; threadId?: string; conversationId?: string }) {
    try {
      return await recordSource({
        orgId: this.organizationId,
        type: 'switch_room',
        ref: input.switchMessageId,
        roomId: input.roomId,
        authorUserId: input.sender?._id,
        authorName: input.senderName,
        excerpt: input.body.slice(0, 400),
        metadata: { switchMessageId: input.switchMessageId, threadId: input.threadId ?? null, conversationId: input.conversationId ?? null, sentAt: input.sentAt.toISOString() },
      });
    } catch {
      return null;
    }
  }

  private async finishMessage(messageId: string, result: Record<string, unknown>) {
    await MessageModel.updateOne({ orgId: this.organizationId, _id: messageId }, { $set: { isProcessed: true, processingResult: result } });
  }

  private async getParticipantNames(agent: RuntimeAgent, roomId?: string): Promise<string[]> {
    if (!agent.client) return [];
    const key = roomId ?? this.roomId ?? 'current';
    const cached = this.participantCache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.names;
    try {
      const participants = await agent.client.listParticipants();
      const names = participants
        .filter((p: any) => p.type !== 'agent')
        .flatMap((p: any) => [p.name, p.alias].filter(Boolean).map(String));
      this.participantCache.set(key, { at: Date.now(), names });
      return names;
    } catch {
      return [];
    }
  }

  private resolveParticipantNames(requested: string[], participants: string[]): string[] {
    const resolved = new Set<string>();
    for (const raw of requested.filter(Boolean)) {
      const wanted = normalizeName(raw);
      if (!wanted) continue;
      const participant = participants.find((name) => {
        const candidate = normalizeName(name);
        return candidate === wanted || (candidate.length > 2 && (candidate.includes(wanted) || wanted.includes(candidate)));
      });
      if (participant) resolved.add(participant);
    }
    return [...resolved];
  }

  private async persistAgentStatus(agent: RuntimeAgent, status: string, error: string | undefined) {
    await SwitchStateModel.updateOne(
      { orgId: this.organizationId, agentKey: agent.key },
      {
        $set: {
          status,
          lastError: error,
          switchAgentId: agent.client?.agentId,
          switchName: agent.client?.switchName ?? this.nameFor(agent.key),
          connected: agent.client?.isConnected ?? false,
          rooms: agent.client?.state.rooms ?? [],
        },
        $setOnInsert: { orgId: this.organizationId, agentKey: agent.key },
      },
      { upsert: true },
    ).catch(() => undefined);
  }

  private async touchAgentState(agent: RuntimeAgent, connected: boolean, error?: string, connectionState?: Record<string, unknown>) {
    await SwitchStateModel.updateOne(
      { orgId: this.organizationId, agentKey: agent.key },
      {
        $set: {
          connected,
          lastHeartbeatAt: new Date(),
          lastEventAt: new Date(),
          rooms: Array.isArray(connectionState?.rooms) ? connectionState!.rooms.map(String) : agent.client?.state.rooms ?? [],
          ...(error ? { lastError: error } : {}),
          switchAgentId: agent.client?.agentId,
          switchName: agent.client?.switchName ?? this.nameFor(agent.key),
        },
        $setOnInsert: { orgId: this.organizationId, agentKey: agent.key },
      },
      { upsert: true },
    ).catch(() => undefined);
  }

  private async composeReply(
    agent: RuntimeAgent,
    input: { roomId: string; message: string; sender: { _id: string; name: string; role: string } | null; senderName: string; switchMessageId: string; addressed: boolean; handoffForMe: boolean },
  ): Promise<{ body: string; toolsUsed: string[]; handoff?: { fromAgentKey: AgentKey; toAgentKey: AgentKey; instruction: string }; durationMs: number; source: 'ai' | 'fallback' | 'error' }> {
    const started = Date.now();
    const conversation = await ConversationModel.findOne({ orgId: this.organizationId, roomId: input.roomId }).lean();
    const recentDocs = await MessageModel.find({ orgId: this.organizationId, roomId: input.roomId, switchMessageId: { $ne: input.switchMessageId } })
      .sort({ sentAt: -1 })
      .limit(8)
      .lean();
    const recent = recentDocs.reverse().map((m) => ({ sender: m.senderName ?? 'teammate', body: m.body, at: m.sentAt ?? (m as { createdAt?: Date }).createdAt ?? new Date() }));
    const snapshot = await this.buildSnapshot();

    const ai = await askTeamForgeAI({
      orgId: this.organizationId,
      roomId: input.roomId,
      roomName: config.SWITCH_ROOM_NAME,
      agentKey: agent.key,
      agentName: agent.catalog.name,
      agentPersona: agent.catalog.description,
      senderName: input.senderName,
      senderUserId: input.sender?._id ?? null,
      senderRole: input.sender?.role ?? 'employee',
      message: input.message,
      recent,
      snapshot,
      sessionId: conversation?.aiSessionId ?? null,
    });

    if (ai.ok && ai.body) {
      if (ai.sessionId) {
        await ConversationModel.updateOne(
          { orgId: this.organizationId, roomId: input.roomId },
          { $set: { aiSessionId: ai.sessionId }, $setOnInsert: { orgId: this.organizationId, roomId: input.roomId, platform: 'switch', title: config.SWITCH_ROOM_NAME } },
          { upsert: true },
        ).catch(() => undefined);
      }
      return { body: ai.body, toolsUsed: ai.toolsUsed, durationMs: Date.now() - started, source: 'ai' };
    }

    if (config.AI_FALLBACK_DETERMINISTIC) {
      logger.warn({ error: ai.error, agent: agent.key }, 'AI brain unavailable — using deterministic fallback for this message');
      // Reset the room's AI session so the next attempt starts clean if the model wedged.
      await ConversationModel.updateOne({ orgId: this.organizationId, roomId: input.roomId }, { $unset: { aiSessionId: '' } }).catch(() => undefined);
      const fb = await respondAsAgent({
        organizationId: this.organizationId,
        roomId: input.roomId,
        agentKey: agent.key,
        body: input.message,
        requesterId: input.sender?._id ?? `switch:${input.senderName}`,
        requesterName: input.senderName,
        requesterRole: input.sender?.role ?? 'employee',
        source: 'live',
        messageId: input.switchMessageId,
      });
      return { body: fb.body, toolsUsed: fb.toolsUsed, handoff: fb.handoff, durationMs: Date.now() - started, source: 'fallback' };
    }

    return {
      body: `I hit a snag thinking that through — give me a second and try me again?`,
      toolsUsed: [],
      durationMs: Date.now() - started,
      source: 'error',
    };
  }

  /** Compact, live org context: the AI starts every reply already knowing the company. */
  private async buildSnapshot(): Promise<string> {
    try {
      const [overview, overdue, openTasks, projects, approvals, decisions, users, profiles, activeReminders] = await Promise.all([
        getOrganizationOverview(this.organizationId),
        getOverdueTasks(this.organizationId),
        searchTasks(this.organizationId, { limit: 10 }),
        ProjectModel.find({ orgId: this.organizationId, status: { $in: ['planning', 'active'] } }).limit(6).lean(),
        getPendingApprovals(this.organizationId, 10),
        DecisionModel.find({ orgId: this.organizationId, status: 'active' }).sort({ decidedAt: -1 }).limit(5).lean(),
        UserModel.find({ orgId: this.organizationId, status: 'active' }).limit(30).lean(),
        EmployeeProfileModel.find({ orgId: this.organizationId }).lean(),
        import('../../db/models/comms.js').then((m) => m.ReminderModel.find({ orgId: this.organizationId, status: { $in: ['scheduled', 'snoozed'] } }).sort({ dueAt: 1 }).limit(5).lean()),
      ]);
      const titleById = new Map(profiles.map((p) => [p.userId, p.title]));
      const lines: string[] = [];
      lines.push(`Organization: ${config.ORG_NAME} (${users.length} people on record)`);
      if (users.length) lines.push('People: ' + users.map((u) => `${u.name} (${u.role}${titleById.get(u._id) ? ', ' + titleById.get(u._id) : ''})`).join('; '));
      else lines.push('People: none recorded yet — the team is new. Capture introductions as they happen.');
      lines.push('Totals: ' + `${overview.activeProjects} active project(s), ${overview.openTasks} open task(s), ${overview.overdueTasks} overdue, ${overview.blockedTasks} blocked, ${overview.pendingApprovals} approval(s) pending.`);
      if (projects.length) lines.push('Projects: ' + projects.map((p) => `${p.name} (${p.status}${p.dueDate ? ', due ' + new Date(p.dueDate).toISOString().slice(0, 10) : ''})`).join('; '));
      const openList = (openTasks as Array<{ title: string; status: string; dueDate?: Date | null; assignees?: Array<{ name: string }> }>).slice(0, 8);
      if (openList.length) lines.push('Open work: ' + openList.map((t) => `${t.title} [${t.status}${t.assignees?.length ? ', ' + t.assignees.map((a) => a.name).join('/') : ''}${t.dueDate ? ', due ' + new Date(t.dueDate).toISOString().slice(0, 10) : ''}]`).join('; '));
      if (overdue.length) lines.push('Overdue: ' + overdue.slice(0, 5).map((t) => `${t.title} (${t.assignees?.map((a) => a.name).join('/') || 'unassigned'}, ${t.daysOverdue}d late)`).join('; '));
      if (decisions.length) lines.push('Recent decisions: ' + decisions.map((d) => `${d.title} (${new Date(d.decidedAt).toISOString().slice(0, 10)})`).join('; '));
      if (approvals.length) lines.push('Awaiting human approval: ' + approvals.map((a) => a.reason ?? a.action).slice(0, 4).join('; '));
      if (activeReminders.length) lines.push('Scheduled reminders: ' + activeReminders.map((r) => `${r.title} at ${new Date(r.dueAt).toISOString()}`).join('; '));
      return lines.join('\n').slice(0, 4000);
    } catch (error) {
      return `Organization: ${config.ORG_NAME}. (Context read failed: ${error instanceof Error ? error.message : String(error)})`;
    }
  }

  /** Every real teammate gets a record the first time they speak — name from their Discord identity. */
  private async resolveOrCreateSender(senderName: string, switchParticipantId: string, at: Date): Promise<{ _id: string; name: string; role: string } | null> {
    const name = senderName.trim() || 'Teammate';
    const value = normalizeName(name);
    if (!value) return null;
    let user = await UserModel.findOne({ orgId: this.organizationId, $or: [{ normalizedName: value }, ...(switchParticipantId ? [{ 'metadata.switchParticipantId': switchParticipantId }] : [])] });
    if (!user) {
      user = await UserModel.create({
        orgId: this.organizationId,
        name,
        normalizedName: value,
        role: 'employee',
        status: 'active',
        metadata: { switchParticipantId, firstSeenAt: at.toISOString() },
        lastSeenAt: at,
      });
      await EmployeeProfileModel.updateOne({ orgId: this.organizationId, userId: user._id }, { $setOnInsert: { orgId: this.organizationId, userId: user._id, joinedAt: at } }, { upsert: true });
      try {
        const entity = await ensurePersonEntity(this.organizationId, String(user._id), name, null, 'agent:switch-runtime');
        await upsertAlias(this.organizationId, name, entity._id, 'person', null, 0.99);
      } catch { /* graph is best-effort here; the AI will link profiles too */ }
      await logAgentAction(this.organizationId, 'switch-runtime', 'person.discovered', { outputSummary: `New teammate on record: ${name}` });
      logger.info({ name }, 'new teammate created from room message');
    } else {
      await UserModel.updateOne({ _id: user._id }, { $set: { lastSeenAt: at, ...(switchParticipantId ? { 'metadata.switchParticipantId': switchParticipantId } : {}) } }).catch(() => undefined);
    }
    return { _id: String(user._id), name: user.name, role: user.role };
  }

  /** Test/demo hook: feeds a synthetic human message through the exact same ingest path. */
  async simulateHumanMessage(input: { roomId?: string; senderName: string; body: string }): Promise<{ ok: boolean; roomId?: string; error?: string }> {
    const roomId = input.roomId ?? this.roomId;
    if (!roomId) return { ok: false, error: 'no room provisioned' };
    const ops = this.agents.get('operations-manager') ?? [...this.agents.values()][0];
    if (!ops) return { ok: false, error: 'no agents' };
    const messageId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.ingestMessage(ops, {
      room_id: roomId,
      payload: {
        message_id: messageId,
        body: input.body,
        sender_name: input.senderName,
        sender: `sim:${normalizeName(input.senderName)}`,
        sender_kind: 'human',
        timestamp: Date.now(),
        addressed: false,
      },
    });
    return { ok: true, roomId };
  }

  private async persistIntegration(status: string, error: string | undefined) {
    await logAudit(this.organizationId, { type: 'system', name: 'switch-runtime' }, `switch.${status}`, { type: 'integration', id: 'switch' }, { error: error ?? null, roomId: this.roomId }).catch(() => undefined);
  }
}

let currentRuntime: SwitchRuntime | null = null;

export function getSwitchRuntime(): SwitchRuntime | null {
  return currentRuntime;
}

export async function startSwitchRuntime(organizationId: string): Promise<SwitchRuntime> {
  if (currentRuntime) {
    if (currentRuntime.organizationId === organizationId && currentRuntime.getStatus().running) return currentRuntime;
    await currentRuntime.stop();
    currentRuntime = null;
  }
  const runtime = new SwitchRuntime(organizationId);
  currentRuntime = runtime;
  try {
    await runtime.start();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error), organizationId }, 'could not start the Switch runtime');
  }
  return runtime;
}

export async function stopSwitchRuntime(): Promise<void> {
  const runtime = currentRuntime;
  currentRuntime = null;
  if (runtime) await runtime.stop();
}

export type { SwitchRuntime };
