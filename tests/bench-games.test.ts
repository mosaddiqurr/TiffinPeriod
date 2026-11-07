import { describe, expect, it } from 'vitest';
import { dealRoles, scoreChits, suspects, ROLES } from '../src/games/chor-police/model';
import { LETTERS, blankAnswers, canReview, knownWord, normalizeWord, scoreWords, type Answers } from '../src/games/naam-desh/model';
import { createRng } from '../src/engine/rng';

describe('Chor Police', () => {
  it('deals exactly one of each role across many seeded rounds', () => {
    const rng = createRng(15), deals = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const roles = dealRoles(() => rng.next());
      expect([...roles].sort()).toEqual([...ROLES].sort()); deals.add(roles.join(','));
    }
    expect(deals.size).toBe(24);
  });
  it('only Chor and Dakat remain as suspects', () => { expect(suspects([...ROLES])).toEqual([2, 3]); });
  it('gives police the reward for finding Chor, and Chor the reward if police fails', () => {
    expect(scoreChits([...ROLES], 3)).toEqual({ correct: true, points: [1000, 100, 500, 0] });
    expect(scoreChits([...ROLES], 2)).toEqual({ correct: false, points: [1000, 0, 500, 100] });
  });
  it('rejects a public role as a guess and duplicated roles', () => {
    expect(() => scoreChits([...ROLES], 1)).toThrow();
    expect(() => scoreChits(['chor', 'chor', 'police', 'babu'], 0)).toThrow();
  });
});

describe('Naam Desh Ful Fol', () => {
  const letter = LETTERS.find((l) => l.bn === 'ক')!;
  it('every offered Bangla letter has examples in all four categories', () => {
    expect(new Set(LETTERS.map((l) => l.bn)).size).toBe(LETTERS.length);
    for (const l of LETTERS) for (let c = 0; c < 4; c++) {
      expect(l.words[c][0].startsWith(l.bn)).toBe(true);
      for (const word of l.words[c]) expect(knownWord(l, c, word)).toBe(true);
    }
  });
  it('accepts normalized Bangla and listed Roman aliases, with category precision', () => {
    expect(knownWord(letter, 1, ' CANADA  ')).toBe(true);
    expect(knownWord(letter, 2, 'ক\u200dদম')).toBe(true);
    expect(knownWord(letter, 3, 'কানাডা')).toBe(false);
    expect(normalizeWord('  সৌদি   আরব  ')).toBe(normalizeWord('সৌদি আরব'));
  });
  it('makes unfamiliar words reviewable but blocks blanks and wrong initials', () => {
    expect(canReview(letter, 0, 'কিশোর')).toBe(true);
    expect(knownWord(letter, 0, 'কিশোর')).toBe(false);
    expect(canReview(letter, 0, 'রহিম')).toBe(false);
    expect(canReview(letter, 0, '')).toBe(false);
  });
  it('scores unique answers at 10 and duplicates at 5, including cross-script aliases', () => {
    const rows: Answers[] = [['করিম', 'কানাডা', 'কদম', 'কাঁঠাল'], ['কামাল', 'canada', 'kodom', 'কলা']];
    expect(scoreWords(letter, rows, rows.map(() => [true, true, true, true]))).toEqual([[10, 5, 5, 10], [10, 5, 5, 10]]);
  });
  it('does not give points to a rejected answer, a wrong initial, or a blank', () => {
    expect(scoreWords(letter, [['করিম', 'রাশিয়া', '', 'কাঁঠাল']], [[false, true, true, true]])).toEqual([[0, 0, 0, 10]]);
    expect(scoreWords(letter, [blankAnswers()], [[true, true, true, true]])).toEqual([[0, 0, 0, 0]]);
  });
  it('only counts accepted duplicates', () => {
    const rows: Answers[] = [['করিম', '', '', ''], ['করিম', '', '', '']];
    expect(scoreWords(letter, rows, [[true], [false]])).toEqual([[10, 0, 0, 0], [0, 0, 0, 0]]);
  });
});

