import { describe, it, expect } from 'vitest';
import { deRoboticize, findRoboticTells, normalizeName, editSimilarity, tokenSimilarity } from '@teamforge/shared';

describe('humanized voice layer', () => {
  it('strips machine-tell openers', () => {
    expect(deRoboticize("Certainly! I'll check the board now.")).toBe("I'll check the board now.");
    expect(deRoboticize('Great question! The API is due Thursday.')).toBe('The API is due Thursday.');
    expect(deRoboticize("I'd be happy to look into that.")).toBe('Look into that.');
  });

  it('keeps human contractions and short sentences intact', () => {
    const human = "Aarav's API is two days late and Neha's blocked on it. Worth a nudge.";
    expect(deRoboticize(human)).toBe(human);
  });

  it('reports no tells on a clean human message', () => {
    expect(findRoboticTells("Aarav's on it — API due Thursday, I'll chase it tomorrow morning.")).toEqual([]);
  });
});

describe('entity resolution primitives', () => {
  it('normalizes names (case, diacritics, punctuation)', () => {
    expect(normalizeName('  Aarav  Sharma!! ')).toBe('aarav sharma');
    expect(normalizeName('Zoë')).toBe('zoe');
  });

  it('editSimilarity: identical = 1, close typo high, unrelated low', () => {
    expect(editSimilarity('aarav', 'aarav')).toBe(1);
    expect(editSimilarity('aarav', 'aaruv')).toBeGreaterThan(0.7);
    expect(editSimilarity('aarav', 'priya')).toBeLessThan(0.3);
  });

  it('tokenSimilarity overlaps tokens sensibly', () => {
    expect(tokenSimilarity('Website Launch', 'website launch')).toBe(1);
    expect(tokenSimilarity('backend api integration', 'api integration work')).toBeGreaterThan(0.3);
  });
});
