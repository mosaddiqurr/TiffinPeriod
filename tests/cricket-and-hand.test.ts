import { describe, expect, it } from 'vitest';
import { addBall, currentOver, decideMatch, inningsComplete, newInnings, oversText, runRate } from '../src/shared/cricket';
import { battingSide, judgeBall, newMatch, playBall, targetOf, tossWinner } from '../src/games/hand-cricket/logic';
import { HandAI } from '../src/games/hand-cricket/ai';
import { createRng } from '../src/engine/rng';

describe('shared cricket scoring', () => {
  it('formats overs and run rate', () => {
    expect(oversText(0)).toBe('0.0');
    expect(oversText(14)).toBe('2.2');
    expect(runRate(12, 6)).toBe(12);
  });
  it('does not count a no-ball as a legal ball', () => {
    let inn = newInnings();
    inn = addBall(inn, { runs: 1, out: false, legal: false, extra: 'nb' });
    expect(inn.balls).toBe(0);
    expect(inn.runs).toBe(1);
  });
  it('ends an innings by wickets, balls or target', () => {
    const lim = { wickets: 2, balls: 6 };
    let inn = newInnings();
    inn = addBall(inn, { runs: 0, out: true, legal: true });
    expect(inningsComplete(inn, lim)).toBe(false);
    inn = addBall(inn, { runs: 0, out: true, legal: true });
    expect(inningsComplete(inn, lim)).toBe(true);
    const chase = addBall(newInnings(), { runs: 6, out: false, legal: true });
    expect(inningsComplete(chase, lim, 6)).toBe(true);
  });
  it('decides runs, wickets and ties', () => {
    const a = { ...newInnings(), runs: 30 };
    expect(decideMatch(a, { ...newInnings(), runs: 20 }, { wickets: 3, balls: null })).toEqual({ winner: 0, kind: 'runs', margin: 10 });
    expect(decideMatch(a, { ...newInnings(), runs: 31, wickets: 1 }, { wickets: 3, balls: null })).toEqual({ winner: 1, kind: 'wickets', margin: 2 });
    expect(decideMatch(a, { ...newInnings(), runs: 30 }, { wickets: 3, balls: null }).kind).toBe('tie');
  });
  it('shows the over in progress', () => {
    let inn = newInnings();
    for (let i = 0; i < 8; i++) inn = addBall(inn, { runs: i % 3, out: false, legal: true });
    expect(currentOver(inn.events)).toHaveLength(2);
  });
});

describe('Hand Cricket rules', () => {
  it('same numbers mean OUT, different numbers score the batter number', () => {
    expect(judgeBall(4, 4)).toEqual({ bat: 4, bowl: 4, out: true, runs: 0 });
    expect(judgeBall(6, 2)).toEqual({ bat: 6, bowl: 2, out: false, runs: 6 });
  });
  it('rejects numbers outside 1..6', () => {
    expect(() => playBall(newMatch({ wickets: 1, overs: null }, 0), 7, 1)).toThrow();
  });
  it('switches innings after the wickets fall and sets the target', () => {
    let m = newMatch({ wickets: 1, overs: null }, 0);
    m = playBall(m, 5, 1);
    m = playBall(m, 3, 3); // out
    expect(m.current).toBe(1);
    expect(targetOf(m)).toBe(6);
    expect(battingSide(m)).toBe(1);
  });
  it('ends the chase as soon as the target is reached', () => {
    let m = newMatch({ wickets: 2, overs: null }, 0);
    m = playBall(m, 4, 1);
    m = playBall(m, 2, 2);
    m = playBall(m, 2, 2); // all out for 4, target 5
    m = playBall(m, 6, 1); // chaser scores 6
    expect(m.done).toBe(true);
    expect(m.result).toMatchObject({ winner: 1, kind: 'wickets', margin: 2, winnerSide: 1 });
  });
  it('limits the innings by overs', () => {
    let m = newMatch({ wickets: 5, overs: 1 }, 1);
    for (let i = 0; i < 6; i++) m = playBall(m, 1, 2);
    expect(m.current).toBe(1);
    expect(m.innings[0].runs).toBe(6);
  });
  it('handles a tie', () => {
    let m = newMatch({ wickets: 1, overs: null }, 0);
    m = playBall(m, 3, 1);
    m = playBall(m, 2, 2);
    m = playBall(m, 3, 1);
    m = playBall(m, 4, 4);
    expect(m.result?.kind).toBe('tie');
    expect(m.result?.winnerSide).toBeNull();
  });
  it('decides the odd/even toss by the parity of the sum', () => {
    expect(tossWinner(0, 'odd', 2, 3)).toBe(0);
    expect(tossWinner(0, 'even', 2, 3)).toBe(1);
    expect(tossWinner(1, 'even', 3, 3)).toBe(1);
  });
});

describe('Hand Cricket computer', () => {
  it('always returns a number from 1 to 6', () => {
    const ai = new HandAI('hard', createRng(1));
    for (let i = 0; i < 500; i++) {
      const n = ai.choose(i % 2 ? 'bat' : 'bowl', { wicketsLeft: 2, ballsLeft: null, need: i % 7 });
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      ai.observe(i % 2 ? 'bowl' : 'bat', (i % 6) + 1);
    }
  });
  it('learns a batter who always shows the same number (hard)', () => {
    const ai = new HandAI('hard', createRng(7));
    for (let i = 0; i < 12; i++) ai.observe('bat', 4);
    let hits = 0;
    for (let i = 0; i < 400; i++) if (ai.choose('bowl', { wicketsLeft: 1, ballsLeft: null }) === 4) hits++;
    expect(hits / 400).toBeGreaterThan(0.6);
  });
  it('plays at random on easy (no learning)', () => {
    const ai = new HandAI('easy', createRng(9));
    for (let i = 0; i < 12; i++) ai.observe('bat', 4);
    let hits = 0;
    for (let i = 0; i < 3000; i++) if (ai.choose('bowl', { wicketsLeft: 1, ballsLeft: null }) === 4) hits++;
    expect(hits / 3000).toBeGreaterThan(0.12);
    expect(hits / 3000).toBeLessThan(0.22);
  });
  it('choose() does not take the opponent’s current pick (fairness by design)', () => {
    expect(HandAI.prototype.choose.length).toBe(2);
  });
});
