import { z } from 'zod';
import { logAgentAction } from '../services/audit.js';

export type ToolTier = 'read' | 'write' | 'sensitive';

export interface ToolActor {
  type: 'user' | 'agent' | 'system';
  id?: string;
  name: string;
}

export interface ToolContext {
  orgId: string;
  actor: ToolActor;
}

export interface ToolDef<I extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>, O = unknown> {
  name: string;
  description: string;
  tier: ToolTier;
  input: I;
  handler: (ctx: ToolContext, input: z.infer<I>) => Promise<O>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any, any>;

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDef>();

  register(def: AnyToolDef) {
    if (this.tools.has(def.name)) throw new Error(`Duplicate tool registration: ${def.name}`);
    this.tools.set(def.name, def);
  }

  list(tier?: ToolTier) {
    return [...this.tools.values()]
      .filter((t) => (tier ? t.tier === tier : true))
      .map((t) => ({ name: t.name, description: t.description, tier: t.tier }));
  }

  get(name: string) {
    return this.tools.get(name);
  }

  describe() {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      tier: t.tier,
      inputSchema: t.input,
    }));
  }

  /** Validate input (strict), execute, audit. Errors come back as structured objects — never thrown at callers. */
  async call(ctx: ToolContext, name: string, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } }> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: { code: 'unknown_tool', message: `No tool named '${name}'. Use /api/tools for the catalog.` } };
    const parsed = tool.input.safeParse(args ?? {});
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid_arguments', message: 'Arguments failed validation', details: parsed.error.flatten() } };
    }
    const started = Date.now();
    try {
      const result = await tool.handler(ctx, parsed.data);
      await logAgentAction(ctx.orgId, ctx.actor.name, 'tool_call', {
        detail: { tool: name, tier: tool.tier },
        durationMs: Date.now() - started,
        outputSummary: safeSummary(result),
      });
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logAgentAction(ctx.orgId, ctx.actor.name, 'tool_call', {
        detail: { tool: name, tier: tool.tier },
        durationMs: Date.now() - started,
        error: message,
      });
      return { ok: false, error: { code: 'tool_failed', message } };
    }
  }
}

function safeSummary(value: unknown): string {
  // Human-readable digest — never a raw JSON dump in the activity feed.
  if (value == null) return 'ok';
  if (typeof value === 'string') return value.slice(0, 160);
  if (Array.isArray(value)) {
    if (value.length === 0) return '0 items';
    const first = value[0];
    const firstKeys = first && typeof first === 'object' ? Object.keys(first as object).slice(0, 3) : [];
    return `${value.length} item${value.length === 1 ? '' : 's'}${firstKeys.length ? ` · ${firstKeys.join(', ')}` : ''}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v))
      .slice(0, 4)
      .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`);
    return entries.length ? entries.join(' · ') : `object(${Object.keys(value as object).length} keys)`;
  }
  return String(value).slice(0, 160);
}
