import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the first .env we find: CWD, then the repo root (two and three levels up).
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [join(process.cwd(), '.env'), join(here, '../../.env'), join(here, '../../../.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4100),
  WEB_ORIGIN: z.string().default('http://127.0.0.1:5183'),
  TEAMFORGE_API_KEY: z.string().min(8).default('change-me-dev-key'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/teamforge-ops'),
  ORG_SLUG: z.string().default('acme'),
  ORG_NAME: z.string().default('Teamforge Workspace'),
  ORG_TIMEZONE: z.string().default('Asia/Kolkata'),

  // ── AI brain: your OpenCode plan, headless. The model decides tools, memory and replies. ──
  OPENCODE_BRAIN_DIR: z.string().default('brain'),
  OPENCODE_MODEL: z.string().default(''), // blank = OpenCode's default model
  OPENCODE_TIMEOUT_MS: z.coerce.number().default(120000),
  AI_FALLBACK_DETERMINISTIC: z.string().default('true').transform((v) => v !== 'false'),

  // Switch (local server: bridge 56565, Gateway 56564). The AI lives in the
  // six always-on Switch agent clients this backend runs — no external LLM.
  SWITCH_SERVER_URL: z.string().default('http://127.0.0.1:56565'),
  SWITCH_REGISTRATION_TOKEN: z.string().default(''),
  SWITCH_GATEWAY_EMAIL: z.string().default(''),
  SWITCH_GATEWAY_PASSWORD: z.string().default(''),
  SWITCH_AUTO_CONNECT: z.string().default('true').transform((v) => v !== 'false' && v !== '0'),
  SWITCH_AUTO_PROVISION: z.string().default('true').transform((v) => v !== 'false' && v !== '0'),
  SWITCH_AUTO_ROUTE: z.string().default('true').transform((v) => v !== 'false' && v !== '0'),
  SWITCH_INTERNAL_ONLY: z.string().default('false').transform((v) => v === 'true' || v === '1'),
  SWITCH_ROOM_NAME: z.string().default('teamforge-lobby'),
  SWITCH_ROOM_DESCRIPTION: z.string().default('TEAMFORGE ops room — people and AI teammates working together through Switch. Say anything; no @mentions needed.'),
  SWITCH_BRIDGE_ID: z.string().default(''),
  SWITCH_CHANNEL_TYPE: z.string().default('channel_public'),
  SWITCH_USER_NAMES: z.string().default('').transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  SWITCH_AGENT_SUFFIX: z.string().default('-tf'),
  SWITCH_CREDENTIALS_PATH: z.string().default('data/switch-credentials.json'),
  // Legacy optional bridge (kept only as a fallback when the runtime is offline).
  SWITCH_PROACTIVE_AGENT_ID: z.string().default(''),
  SWITCH_PROACTIVE_API_KEY: z.string().default(''),
  SWITCH_LOBBY_ROOM_ID: z.string().default(''),
  SWITCH_DIGEST_ROOM_ID: z.string().default(''),
  TEAMFORGE_DEMO_MODE: z.string().default('false').transform((v) => v === 'true' || v === '1'),

  MORNING_BRIEF_CRON: z.string().default('30 8 * * *'),
  PROACTIVE_MAX_PER_DAY: z.coerce.number().default(6),
  QUIET_HOURS_START: z.string().default('21:30'),
  QUIET_HOURS_END: z.string().default('08:30'),
});

export const config = configSchema.parse(process.env);
export type AppConfig = typeof config;
