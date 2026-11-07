import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { logger } from '../../utils/logger.js';
import type { SwitchCredentials } from './credential-store.js';

export interface SwitchFrame {
  event: string;
  data: any;
  id?: number;
}

export class SwitchApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'SwitchApiError';
    this.status = status;
    this.detail = detail;
  }
}

const CONNECTION_BOUND_OPS = new Set([
  'connect_to_room', 'post_message', 'send_targeted_message', 'list_participants', 'read_context', 'assume_role', 'release_role',
]);

export interface SwitchClientHandlers {
  onFrame?: (frame: SwitchFrame) => void | Promise<void>;
  onConnected?: () => void | Promise<void>;
  onDisconnected?: (reason: string) => void | Promise<void>;
  onError?: (error: Error) => void;
}

const wsUrl = (base: string) => base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

function errorDetail(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    try { return JSON.stringify(d); } catch { return String(d); }
  }
  try { return JSON.stringify(body); } catch { return String(body); }
}

async function timed<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`${label} timed out`)), ms);
  try {
    return await fn();
  } finally {
    clearTimeout(t);
  }
}

export async function registerSwitchAgent(
  baseUrl: string,
  registrationToken: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; api_key: string }> {
  const response = await timed(
    () => fetch(`${baseUrl.replace(/\/+$/, '')}/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${registrationToken}` },
      body: JSON.stringify(payload),
    }),
    20_000,
    'registration',
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new SwitchApiError(`Switch registration failed (${response.status}): ${errorDetail(body)}`, response.status, body);
  return body as { id: string; api_key: string };
}

/** Opens addressing for the agent via the Gateway (owner can then address the agent from any participant). */
export async function openSwitchAgentAddressing(baseUrl: string, agentId: string, email: string, password: string): Promise<void> {
  const root = baseUrl.replace(/\/+$/, '');
  const login = await timed(
    () => fetch(`${root}/gateway/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    20_000,
    'gateway login',
  );
  const loginBody = await login.json().catch(() => null);
  if (!login.ok) throw new SwitchApiError(`Gateway login failed (${login.status}): ${errorDetail(loginBody)}`, login.status, loginBody);
  const cookie = (login.headers.get('set-cookie') ?? '').match(/(?:^|,\s*)(switch_auth=[^;]+)/)?.[1];
  if (!cookie) throw new SwitchApiError('Gateway login succeeded without a session cookie', 502);
  const response = await timed(
    () => fetch(`${root}/gateway/agents/${encodeURIComponent(agentId)}/addressing-policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ policy: null }),
    }),
    20_000,
    'addressing policy',
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new SwitchApiError(`Addressing policy update failed (${response.status}): ${errorDetail(body)}`, response.status, body);
}

export class SwitchClient {
  readonly credentials: SwitchCredentials;
  private readonly baseUrl: string;
  private readonly handlers: SwitchClientHandlers;
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private lastEventAt: Date | null = null;
  private lastError: string | null = null;
  private rooms: string[] = [];
  private cursor = 0;
  private generation: number | null = null;
  private connectionWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  constructor(baseUrl: string, credentials: SwitchCredentials, handlers: SwitchClientHandlers = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.credentials = credentials;
    this.handlers = handlers;
  }

  get switchName() { return this.credentials.switchName; }
  get agentId() { return this.credentials.agentId; }
  get isConnected() { return this.connected; }
  get state() { return { connected: this.connected, rooms: [...this.rooms], lastEventAt: this.lastEventAt, lastError: this.lastError }; }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}, connectionBound = false): Promise<T> {
    return timed(async () => {
      const headers: Record<string, string> = { authorization: `Bearer ${this.credentials.apiKey}`, ...extraHeaders };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (connectionBound && this.credentials.connectionId) headers['x-switch-connection-id'] = this.credentials.connectionId;
      const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      if (!response.ok) throw new SwitchApiError(`HTTP ${response.status} on ${path}: ${errorDetail(parsed)}`, response.status, parsed);
      return parsed as T;
    }, 20_000, path);
  }

  async start() {
    if (this.socket && this.connected) return;
    this.stopped = false;
    this.openSocket();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.socket?.close(1000, 'client stopping'); } catch { /* ignore */ }
    this.socket = null;
    this.connected = false;
    this.flushWaiters(new Error('client stopped'));
  }

  async waitForConnection(timeoutMs: number): Promise<void> {
    if (this.connected) return;
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e: Error) => { clearTimeout(timer); reject(e); },
      };
      const timer = setTimeout(() => {
        const idx = this.connectionWaiters.indexOf(waiter);
        if (idx >= 0) this.connectionWaiters.splice(idx, 1);
        reject(new Error('Timed out waiting for Switch connection'));
      }, timeoutMs);
      this.connectionWaiters.push(waiter);
    });
  }

  private flushWaiters(error: Error | null) {
    const waiters = this.connectionWaiters.splice(0, this.connectionWaiters.length);
    for (const w of waiters) (error ? w.reject(error) : w.resolve());
  }

  private openSocket() {
    if (this.stopped) return;
    const url = new URL(`${wsUrl(this.baseUrl)}/agents/${this.credentials.agentId}/connection/ws`);
    url.searchParams.set('connection_id', this.credentials.connectionId);
    url.searchParams.set('scope', 'all');
    url.searchParams.set('filter', 'all');
    url.searchParams.set('start_from', String(this.cursor || 'head'));
    if (this.generation !== null) url.searchParams.set('expected_generation', String(this.generation));

    let socket: WebSocket;
    try {
      socket = new WebSocket(url, { headers: { authorization: `Bearer ${this.credentials.apiKey}` } });
    } catch (error) {
      this.handleSocketFailure(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    this.socket = socket;

    socket.on('message', (raw: WebSocket.RawData) => {
      let frame: any;
      try { frame = JSON.parse(raw.toString()); } catch { return; }
      void this.handleFrame(frame);
    });
    socket.on('close', (code: number, reason: Buffer) => {
      const wasConnected = this.connected;
      this.connected = false;
      if (this.stopped) return;
      const reasonText = `socket closed ${code}${reason?.length ? `: ${reason.toString()}` : ''}`;
      if (wasConnected) void this.handlers.onDisconnected?.(reasonText);
      this.scheduleReconnect(code === 4409 ? 5_000 : Math.min(30_000, 1_000 * 2 ** this.reconnectAttempts));
    });
    socket.on('error', (error: Error) => {
      this.lastError = error.message;
      this.handlers.onError?.(error);
    });
  }

  private scheduleReconnect(delay: number) {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private handleSocketFailure(error: Error) {
    this.lastError = error.message;
    this.handlers.onError?.(error);
    this.scheduleReconnect(Math.min(30_000, 1_000 * 2 ** this.reconnectAttempts));
  }

  private async handleFrame(frame: any) {
    const kind: string | undefined = frame?.event ?? frame?.type;
    const data: any = frame?.data ?? frame;

    // Control frames
    if (kind === 'connection_state') {
      this.generation = typeof data?.generation === 'number' ? data.generation : null;
      this.cursor = typeof data?.cursor === 'number' ? data.cursor : this.cursor;
      this.rooms = Array.isArray(data?.rooms) ? data.rooms.map(String) : [];
      this.connected = true;
      this.reconnectAttempts = 0;
      this.flushWaiters(null);
      await this.handlers.onConnected?.();
      return;
    }
    if (kind === 'ping') {
      this.send({ type: 'pong', cursor: this.cursor });
      return;
    }
    if (kind === 'evicted') {
      const code = String(data?.code ?? '');
      if (code === 'taken_over') {
        this.stopped = true; // another process took the connection — do not reconnect
        this.connected = false;
        void this.handlers.onDisconnected?.('taken_over');
        this.flushWaiters(new Error('Connection taken over by another client'));
      }
      return;
    }
    if (kind === 'gap' || kind === 'subscription_changed' || kind === 'room_released' || kind === 'refused') {
      if (kind === 'gap' && typeof data?.resumed_at === 'number') this.cursor = data.resumed_at;
      if (kind === 'subscription_changed' && Array.isArray(data?.rooms)) this.rooms = data.rooms.map(String);
      logger.warn({ frame: kind, agent: this.credentials.key }, 'switch control frame');
      return;
    }

    // Domain events: { event, data, id }
    if (!kind) return;
    const seq = typeof frame?.id === 'number' ? frame.id : typeof data?.sequence === 'number' ? data.sequence : undefined;
    if (typeof seq === 'number') this.cursor = Math.max(this.cursor, seq);
    this.lastEventAt = new Date();
    await this.handlers.onFrame?.({ event: kind, data, id: seq });
  }

  private send(payload: Record<string, unknown>) {
    try { this.socket?.send(JSON.stringify(payload)); } catch { /* socket dropping */ }
  }

  /* ── Operations ─────────────────────────────────────────────── */

  private async op<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
    const path = `/agents/${this.credentials.agentId}/ops/${operation}`;
    if (CONNECTION_BOUND_OPS.has(operation)) {
      return this.request<{ result: T }>('POST', path, args, {}, true).then((r) => (r as any).result as T);
    }
    return this.request<{ result: T }>('POST', path, args).then((r) => (r as any).result as T);
  }

  async listRooms(): Promise<any[]> {
    const result = await this.op<any>('list_rooms', {});
    return Array.isArray(result) ? result : result?.rooms ?? [];
  }

  async createRoom(input: { name: string; description?: string; agentNames?: string[]; userNames?: string[]; instructions?: string; bridgeId?: string; channelType?: string; internalOnly?: boolean }): Promise<any> {
    // Live contract (verified against server 0.31.0): snake_case args.
    const args: Record<string, unknown> = {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.agentNames?.length ? { agent_names: input.agentNames } : {}),
      ...(input.userNames?.length ? { user_names: input.userNames } : {}),
      ...(input.instructions ? { instructions: input.instructions } : {}),
    };
    if (input.internalOnly) args.internal_only = true;
    else if (input.bridgeId) {
      args.bridge_id = input.bridgeId;
      args.channel_type = input.channelType ?? 'channel_public';
    }
    return this.op<any>('create_room', args);
  }

  async getRoomDetail(roomId: string): Promise<any> {
    return this.op<any>('get_room_detail', { room_id: roomId });
  }

  async listParticipants(): Promise<any[]> {
    const result = await this.op<any>('list_participants', {});
    return Array.isArray(result) ? result : result?.participants ?? [];
  }

  async inviteAgent(roomId: string, agentName: string): Promise<any> {
    return this.op<any>('invite_agent_to_room', { room_id: roomId, agent_name: agentName });
  }

  async connectToRoom(roomId: string): Promise<any> {
    return this.op<any>('connect_to_room', { room_id: roomId });
  }

  async postMessage(content: string, threadId?: string): Promise<string> {
    const roomId = this.state.rooms[0];
    if (!roomId) throw new SwitchApiError('post_message requires a claimed room', 400);
    const result = await this.op<any>('post_message', { body: content, ...(threadId ? { thread_id: threadId } : {}) });
    return String(result?.event_id ?? result?.message_id ?? result?.id ?? '');
  }

  async sendTargetedMessage(content: string, targetNames: string[], threadId?: string): Promise<any> {
    return this.op<any>('send_targeted_message', { body: content, target_names: targetNames, ...(threadId ? { thread_id: threadId } : {}) });
  }

  async readContext(): Promise<any> {
    return this.op<any>('read_context', {});
  }

  async listBridges(): Promise<any[]> {
    const result = await this.op<any>('list_bridges', {});
    return Array.isArray(result) ? result : result?.bridges ?? [];
  }

  async archiveRoom(roomId: string): Promise<any> {
    return this.op<any>('archive_room', { room_id: roomId });
  }

  /** Post a real file attachment into the room through Switch (multipart). */
  async sendMedia(roomId: string, filePath: string, filename: string, caption?: string): Promise<string> {
    const bytes = new Uint8Array(readFileSync(filePath));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
    if (caption) form.append('caption', caption);
    const response = await fetch(`${this.baseUrl}/agents/${this.credentials.agentId}/rooms/${roomId}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.credentials.apiKey}` },
      body: form,
    });
    const text = await response.text();
    if (!response.ok) throw new SwitchApiError(`Switch media upload failed (${response.status}): ${errorDetail(text)}`, response.status, text);
    try {
      const parsed = JSON.parse(text) as { event_id?: string; result?: { event_id?: string } };
      return String(parsed.event_id ?? parsed.result?.event_id ?? '');
    } catch {
      return '';
    }
  }

  /** Switch's documented typing endpoint — the Discord typing indicator, under this agent's name. */
  async setTyping(roomId: string, isTyping: boolean): Promise<void> {
    await this.request('POST', `/agents/${this.credentials.agentId}/typing`, { room_id: roomId, is_typing: isTyping });
  }

  /** Post directly to a room without needing a claimed connection. */
  async postToRoom(roomId: string, content: string): Promise<void> {
    await this.request('POST', `/agents/${this.credentials.agentId}/message`, { room_id: roomId, content });
  }

  /** Move a room onto a bridge (or re-bridge it), provisioning a fresh external channel. */
  async updateRoom(roomId: string, bridgeId: string, channelType = 'channel_public'): Promise<any> {
    return this.op<any>('update_room', { room_id: roomId, bridge_id: bridgeId, channel_type: channelType });
  }
}

export function newConnectionId(): string {
  return randomUUID();
}
