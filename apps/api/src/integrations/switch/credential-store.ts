import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface SwitchCredentials {
  key: string;
  switchName: string;
  displayName: string;
  agentId: string;
  apiKey: string;
  connectionId: string;
  registeredAt: string;
  lastConnectedAt?: string;
}

/**
 * File-backed credential store (mode 0600), gitignored.
 * Switch agent API keys must NOT live in MongoDB.
 */
export class SwitchCredentialStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(join(file, '..'), { recursive: true });
  }

  private readAll(): Record<string, SwitchCredentials> {
    try {
      if (!existsSync(this.file)) return {};
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, SwitchCredentials>;
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, SwitchCredentials>) {
    const tmp = `${this.file}.${createHash('sha256').update(String(process.pid)).digest('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.file);
  }

  private baseKey(baseUrl: string) {
    return createHash('sha256').update(baseUrl.replace(/\/+$/, '')).digest('hex').slice(0, 16);
  }

  async load(baseUrl: string): Promise<Record<string, SwitchCredentials>> {
    const all = this.readAll();
    const prefix = `${this.baseKey(baseUrl)}:`;
    const out: Record<string, SwitchCredentials> = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    return out;
  }

  async upsert(baseUrl: string, key: string, value: SwitchCredentials): Promise<SwitchCredentials> {
    const all = this.readAll();
    all[`${this.baseKey(baseUrl)}:${key}`] = value;
    this.writeAll(all);
    return value;
  }

  async remove(baseUrl: string, key: string) {
    const all = this.readAll();
    delete all[`${this.baseKey(baseUrl)}:${key}`];
    this.writeAll(all);
  }
}

export function safeUnlink(file: string) {
  try { unlinkSync(file); } catch { /* ignore */ }
}
