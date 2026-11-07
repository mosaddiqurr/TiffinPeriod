import { describe, expect, it } from 'vitest';
import { dealRoles, scoreChits, suspects, ROLES } from '../src/games/chor-police/model';
import { fingerRound } from '../src/games/jor-bejor/model';
import { LETTERS, blankAnswers, canReview, knownWord, normalizeWord, scoreWords, type Answers } from '../src/games/naam-desh/model';
import { applyMove, chooseMove, initialPosition, legalMoves, linked, positionKey, verdict, type Position } from '../src/games/bagh-bandi/model';
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

describe('Jor-Bejor', () => {
  it('resolves all 72 possible hand/call combinations, including 0+0', () => {
    for (let a = 0; a <= 5; a++) for (let b = 0; b <= 5; b++) for (const call of ['even', 'odd'] as const) {
      const result = fingerRound(a, b, call);
      expect(result.total).toBe(a + b);
      expect(result.winner).toBe((a + b) % 2 === (call === 'even' ? 0 : 1) ? 0 : 1);
    }
    expect(fingerRound(0, 0, 'even').winner).toBe(0);
  });
  it('rejects negative, fractional, NaN and out-of-range hands', () => {
    for (const v of [-1, 6, 1.5, NaN]) expect(() => fingerRound(v, 2, 'odd')).toThrow();
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

describe('Bengal Bagh Bandi', () => {
  function empty(): Position { return { ...initialPosition(), goats: Array(25).fill(0), tigers: [7, 17], turn: 'tigers' }; }
  it('starts with two tigers, four stacks of five goats, and goats first', () => {
    const s = initialPosition();
    expect(s.tigers).toEqual([7, 17]); expect(s.turn).toBe('goats');
    expect(s.goats.reduce((a, b) => a + b)).toBe(20);
    expect(s.goats.flatMap((count, i) => count ? [i] : [])).toEqual([1, 3, 11, 13]);
  });
  it('follows only drawn lines, including diagonals on even intersections and no row wrapping', () => {
    expect(linked(0, 6)).toBe(true); expect(linked(1, 7)).toBe(false);
    expect(linked(4, 5)).toBe(false); expect(linked(0, 2)).toBe(false);
    expect(linked(5, 6)).toBe(true); expect(linked(-1, 0)).toBe(false);
    for (let a = 0; a < 25; a++) for (let b = 0; b < 25; b++) expect(linked(a, b)).toBe(linked(b, a));
  });
  it('moves just one goat from a stack without mutating the previous board', () => {
    const start = initialPosition(), next = applyMove(start, { from: 1, to: 6 });
    expect(start.goats[1]).toBe(5); expect(next.goats[1]).toBe(4); expect(next.goats[6]).toBe(1);
    expect(next.turn).toBe('tigers');
  });
  it('forbids moving onto any occupied point or creating new stacks', () => {
    const s = initialPosition();
    expect(() => applyMove(s, { from: 1, to: 7 })).toThrow();
    expect(() => applyMove(s, { from: 1, to: 3 })).toThrow();
    expect(() => applyMove(s, { from: 7, to: 6 })).toThrow();
  });
  it('captures only the top goat from a stack; a normal move remains optional', () => {
    const s = empty(); s.goats[6] = 5; s.goats[11] = 5;
    expect(legalMoves(s)).toContainEqual({ from: 7, to: 5, capture: 6 });
    expect(legalMoves(s)).toContainEqual({ from: 7, to: 8 });
    const next = applyMove(s, { from: 7, to: 5 });
    expect(next.goats[6]).toBe(4); expect(next.captured).toBe(1); expect(next.turn).toBe('goats');
    expect(next.quiet).toBe(0);
  });
  it('cannot jump over another tiger, off the board, or onto an occupied point', () => {
    const s = empty(); s.tigers = [7, 6]; s.goats[11] = 5;
    expect(legalMoves(s).some((m) => m.from === 7 && m.to === 5)).toBe(false);
    s.tigers = [7, 17]; s.goats[6] = 1; s.goats[5] = 1;
    expect(legalMoves(s).some((m) => m.from === 7 && m.to === 5)).toBe(false);
  });
  it('awards goats the win only when both tigers are trapped', () => {
    const s = empty();
    s.goats.fill(1); s.tigers.forEach((p) => { s.goats[p] = 0; });
    expect(verdict(s)).toBe('goats');
    s.goats[2] = 0;
    expect(verdict(s)).not.toBe('goats');
  });
  it('enforces the chosen capture target and the quiet-move draw', () => {
    const s = initialPosition(10); s.captured = 10;
    expect(verdict(s)).toBe('tigers');
    const long = initialPosition(18); long.captured = 10;
    expect(verdict(long)).toBe(null);
    long.quiet = 100; expect(verdict(long)).toBe('draw');
  });
  it('keys include the side to move and stack sizes but not tiger array order', () => {
    const s = initialPosition(), reverse = { ...s, tigers: [...s.tigers].reverse() };
    expect(positionKey(s)).toBe(positionKey(reverse));
    expect(positionKey(s)).not.toBe(positionKey({ ...s, turn: 'tigers' }));
  });
  it('plays a full computer-v-computer game with legal moves and conserved pieces', () => {
    const rng = createRng(44); let s = initialPosition(); const seen = new Map<string, number>();
    for (let i = 0; i < 300 && !verdict(s); i++) {
      const move = chooseMove(s, 1, () => rng.next()); expect(move).not.toBeNull();
      expect(legalMoves(s)).toContainEqual(move);
      s = applyMove(s, move!);
      expect(s.goats.reduce((a, b) => a + b) + s.captured).toBe(20);
      expect(new Set(s.tigers).size).toBe(2);
      expect(s.tigers.every((p) => s.goats[p] === 0)).toBe(true);
      const key = positionKey(s), count = (seen.get(key) ?? 0) + 1; seen.set(key, count);
      if (count >= 3) return;
    }
    expect(verdict(s)).not.toBe(null);
  });
  it('the computer takes an immediate winning capture', () => {
    const s = empty(); s.goats[6] = 1; s.goats[11] = 10; s.captured = 9;
    const move = chooseMove(s, 2, () => .2)!;
    expect(move.capture).not.toBeUndefined(); expect(verdict(applyMove(s, move))).toBe('tigers');
  });
});
