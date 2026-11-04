import { describe, expect, it } from 'vitest';
import { DIGITS, LINEUPS, MAX_PAGE, MIN_PAGE, PRESETS, expectedRunsPerBall, isPlayable, lastDigit, newMatch, pickPage, playPage, strikerIndex, type RuleSet } from '../src/games/book-cricket/logic';
import { createRng } from '../src/engine/rng';

const classic = PRESETS[0];
const noball = PRESETS[1];
const lineups = LINEUPS.en;

describe('Book Cricket pages', () => {
  it('only opens even left-hand pages in the play range', () => {
    const rng = createRng(3);
    for (let i = 0; i < 2000; i++) {
      const p = pickPage(rng);
      expect(p % 2).toBe(0);
      expect(p).toBeGreaterThanOrEqual(MIN_PAGE);
      expect(p).toBeLessThanOrEqual(MAX_PAGE);
    }
  });
  it('gives every last digit the same chance (about 20 %)', () => {
    const rng = createRng(11);
    const n = 50000;
    const count: Record<number, number> = { 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 };
    for (let i = 0; i < n; i++) count[lastDigit(pickPage(rng))]++;
    for (const d of DIGITS) expect(Math.abs(count[d] / n - 0.2)).toBeLessThan(0.015);
  });
});

describe('Book Cricket rules', () => {
  it('classic: 0 is out, 8 is one run', () => {
    let m = newMatch({ wickets: 2, overs: null, rules: classic }, 0, lineups);
    m = playPage(m, 48);
    expect(m.innings[0].runs).toBe(1);
    m = playPage(m, 60);
    expect(m.innings[0].wickets).toBe(1);
    expect(strikerIndex(m)).toBe(1);
    expect(m.cards[0][0]).toMatchObject({ name: 'Rafi', runs: 1, balls: 2, out: true });
  });
  it('no-ball rule: 8 adds one run and does not use a ball', () => {
    let m = newMatch({ wickets: 2, overs: 1, rules: noball }, 0, lineups);
    m = playPage(m, 128);
    expect(m.innings[0]).toMatchObject({ runs: 1, balls: 0 });
  });
  it('ends the innings when all wickets fall, then the chase can win', () => {
    let m = newMatch({ wickets: 1, overs: null, rules: classic }, 1, lineups);
    m = playPage(m, 46); // 6
    m = playPage(m, 20); // out
    expect(m.current).toBe(1);
    m = playPage(m, 46);
    m = playPage(m, 44); // 10 > 6
    expect(m.done).toBe(true);
    expect(m.result?.winnerSide).toBe(0);
  });
  it('a rule set without OUT is not playable', () => {
    const bad: RuleSet = { id: 'x', name: { bn: '', en: '' }, map: { 0: { kind: 'runs', runs: 1 }, 2: { kind: 'runs', runs: 2 }, 4: { kind: 'runs', runs: 4 }, 6: { kind: 'runs', runs: 6 }, 8: { kind: 'nb' } } };
    expect(isPlayable(bad)).toBe(false);
    expect(PRESETS.every(isPlayable)).toBe(true);
  });
  it('expected runs per legal ball for the classic rules is 13/5', () => {
    expect(expectedRunsPerBall(classic)).toBeCloseTo(13 / 5, 5);
  });
  it('a full simulated match always finishes', () => {
    const rng = createRng(5);
    for (let k = 0; k < 200; k++) {
      let m = newMatch({ wickets: 3, overs: 3, rules: k % 2 ? classic : noball }, (k % 2) as 0 | 1, lineups);
      let guard = 0;
      while (!m.done && guard++ < 500) m = playPage(m, pickPage(rng));
      expect(m.done).toBe(true);
    }
  });
});
