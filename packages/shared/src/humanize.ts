/**
 * The Humanized Voice Layer — the heart of TEAMFORGE's tone.
 *
 * Two parts:
 *  1. HUMANIZE_STYLE_GUIDE — injected into every agent's system prompt.
 *  2. deRoboticize() — a deterministic post-pass applied to anything that
 *     leaves an agent for a human channel. It strips the tells of
 *     machine-written copy and keeps the message warm, brief and specific.
 */

export const HUMANIZE_STYLE_GUIDE = `
HOW YOU WRITE (this is non-negotiable):
- Sound like a sharp, warm teammate who happens to be very organized — not like a chatbot, not like a corporate memo.
- Use the person's first name. Use contractions (it's, we'll, I'll). Short sentences. Real verbs.
- Get to the point in the first sentence. Context second, ask third.
- Acknowledge feelings in one short clause when it matters ("That's a squeeze, yeah — let's figure it out.") then do work.
- Never open with: "Sure!", "Certainly!", "Of course!", "Great question!", "Absolutely!", "I'd be happy to", "As an AI".
- Never say "I cannot" / "I am unable to" — say what you *can* do, or what you need.
- Don't narrate your process ("Let me search the database…"). Just do it, then share what you found.
- Prefer "here's where things stand" over "Here is a summary of the current status."
- One idea per message where possible. Ask ONE question at a time. If you need three things, list at most three short lines.
- Match the energy of the room: casual room → casual register; a serious escalation → calm, direct, no fluff.
- Uncertainty is fine and human: "not sure yet", "my read is…", "worth double-checking with Priya" — never fake confidence.
- Disagreement is allowed, delivered respectfully with reasoning, never with hedging mush.
- Numbers and names beat adjectives. "Aarav's API is due Thursday and Neha's blocked on it" > "there may be some risk to timeline".
- End with a clear next step or an open question. No sign-offs, no "Best regards", no emoji spam (one max, and only if the room uses them).
- If someone is stressed or it's a hard message (layoffs, delays, conflict), slow down and be plain and kind.
- Keep messages under ~90 words unless asked for a report. Reports go in structured blocks with clear headers.
`.trim();

/** Phrases that instantly make a message read as machine-written. We strip or rewrite them. */
const ROBOTIC_TELLS: Array<[RegExp, string]> = [
  [/^certainly[!,]?\s*/i, ''],
  [/^sure thing[!,]?\s*/i, ''],
  [/^of course[!,]?\s*/i, ''],
  [/^absolutely[!,]?\s*/i, ''],
  [/^great question[!,]?\s*/i, ''],
  [/^i'd be happy to\s*/i, ''],
  [/^i would be happy to\s*/i, ''],
  [/^as an ai\b[^.]*\.?\s*/i, ''],
  [/^i'm an ai[^.]*\.?\s*/i, ''],
  [/^it's important to note that\s*/i, ''],
  [/^it is important to note that\s*/i, ''],
  [/^it's worth noting that\s*/i, ''],
  [/^in conclusion[,.]?\s*/i, ''],
  [/^in summary[,.]?\s*/i, ''],
  [/^overall[,.]?\s*/i, ''],
  [/^leverag(e|ing)\s+/gi, 'use '],
  [/^utilize\s+/gi, 'use '],
  [/\bdelve into\b/gi, 'dig into'],
  [/\bnavigate the complexities of\b/gi, 'work through'],
  [/\bin today's fast-paced (world|environment)\b/gi, 'right now'],
  [/\bgame[- ]changer\b/gi, 'real shift'],
  [/\bseamless(ly)?\b/gi, 'smooth$1'],
  [/\brobust\b/gi, 'solid'],
  [/\bsynerg(y|ies|istic)\b/gi, 'working relationship'],
  [/\bunlock(ing)? (the )?(power|potential) of\b/gi, 'make the most of'],
  [/\bat the end of the day\b/gi, 'ultimately'],
  [/\brest assured[,.]?\s*/i, ''],
  [/\bi hope this (helps|message finds you well)[^.]*\.?\s*/i, ''],
  [/\blet me know if you (have any questions|need anything)[^.]*\.?\s*/i, ''],
];

/** Deterministic post-pass. Safe to run on any outbound agent message. */
export function deRoboticize(text: string): string {
  let out = text.trim();
  // collapse the worst openers (multi-sentence openers like "Certainly! Here is…")
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [pattern, replacement] of ROBOTIC_TELLS) {
      const next = out.replace(pattern, replacement);
      if (next !== out) { out = next; changed = true; }
    }
    if (!changed) break;
  }
  // punctuation hygiene
  out = out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([!?]){2,}/g, '$1')
    .trim();
  // capitalize the first letter if a strip left a lowercase start
  if (/^[a-z]/.test(out)) out = out[0]!.toUpperCase() + out.slice(1);
  return out;
}

/** Cheap sanity check used in tests: flags obvious machine tells. Returns list of offending phrases (empty = clean). */
export function findRoboticTells(text: string): string[] {
  const hits: string[] = [];
  for (const [pattern] of ROBOTIC_TELLS) {
    if (pattern.global || pattern.source.includes('^')) {
      const m = text.match(pattern);
      if (m) hits.push(m[0].trim());
    } else if (pattern.test(text)) {
      const m = text.match(pattern);
      if (m) hits.push(m[0].trim());
    }
  }
  return hits.filter(Boolean);
}
