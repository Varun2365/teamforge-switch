/**
 * @teamforge/shared — event names, DTOs and tiny pure helpers shared by api / agents / web.
 * No I/O in here. Everything is deterministic and dependency-light (zod only).
 */
export * from './events.js';
export * from './types.js';
export * from './humanize.js';

export function newId(): string {
  return crypto.randomUUID();
}

/** Normalise a name for entity resolution: lowercase, strip punctuation/diacritics, collapse spaces. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap similarity in [0,1] — used as a cheap fuzzy match before any LLM is consulted. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Levenshtein distance (iterative, O(min(m,n)) space). */
export function levenshtein(a: string, b: string): number {
  const s = normalizeName(a), t = normalizeName(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length]!;
}

/** 0..1 similarity from edit distance. */
export function editSimilarity(a: string, b: string): number {
  const s = normalizeName(a), t = normalizeName(b);
  const max = Math.max(s.length, t.length);
  if (max === 0) return 1;
  return 1 - levenshtein(s, t) / max;
}
