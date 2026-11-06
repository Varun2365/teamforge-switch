/** Minimal structured logger — consistent single-line output for the runtime and workers. */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, first: unknown, second?: unknown) {
  const ts = new Date().toISOString();
  const line = typeof first === 'string' ? first : `${second ?? ''} ${safe(first)}`.trim();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  // eslint-disable-next-line no-console
  (console[level === 'debug' ? 'log' : level] ?? console.log)(`${prefix} ${line}`);
}

function safe(value: unknown): string {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export const logger = {
  debug: (first: unknown, second?: unknown) => emit('debug', first, second),
  info: (first: unknown, second?: unknown) => emit('info', first, second),
  warn: (first: unknown, second?: unknown) => emit('warn', first, second),
  error: (first: unknown, second?: unknown) => emit('error', first, second),
};
