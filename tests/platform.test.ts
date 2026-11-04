import { describe, expect, it } from 'vitest';
import { fill, toBnDigits } from '../src/platform/i18n';
import { UI } from '../src/platform/strings';
import { GAMES } from '../src/platform/registry';
import { getStats, recordResult, ACHIEVEMENTS } from '../src/platform/scores';
import { parseHash, href } from '../src/platform/router';
import { createRng } from '../src/engine/rng';

describe('i18n', () => {
  it('converts digits to Bangla', () => {
    expect(toBnDigits('2.5 / 10')).toBe('২.৫ / ১০');
  });
  it('fills templates with language digits', () => {
    expect(fill('Need {r} runs', { r: 12 }, 'bn')).toBe('Need ১২ runs');
    expect(fill('Need {r} runs', { r: 12 }, 'en')).toBe('Need 12 runs');
  });
  it('the Bangla and English UI tables have the same keys and no empty text', () => {
    expect(Object.keys(UI.bn).sort()).toEqual(Object.keys(UI.en).sort());
    for (const v of [...Object.values(UI.bn), ...Object.values(UI.en)]) expect(v.trim().length).toBeGreaterThan(0);
  });
});

describe('registry', () => {
  it('lists exactly 24 games with numbers 1..24', () => {
    expect(GAMES).toHaveLength(24);
    expect(GAMES.map((g) => g.no)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
  it('Phase 1 and 2 are playable; every playable game has a loader and modes; planned games have none', () => {
    expect(GAMES.filter((g) => g.phase < 3).every((g) => g.playable)).toBe(true);
    for (const g of GAMES.filter((x) => x.playable)) { expect(typeof g.load).toBe('function'); expect(g.modes.length).toBeGreaterThan(0); }
    for (const g of GAMES.filter((x) => !x.playable)) expect(g.load).toBeUndefined();
  });
  it('every achievement belongs to a playable game', () => {
    const ids = new Set(GAMES.filter((g) => g.playable).map((g) => g.id));
    for (const a of ACHIEVEMENTS) expect(ids.has(a.gameId)).toBe(true);
  });
});

describe('router', () => {
  it('parses and builds hash routes', () => {
    expect(parseHash('#/play/tug-of-war')).toEqual({ name: 'play', id: 'tug-of-war' });
    expect(parseHash('#/roadmap')).toEqual({ name: 'roadmap' });
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(href({ name: 'play', id: 'x' })).toBe('#/play/x');
  });
});

describe('local scores', () => {
  it('keeps the best score, wins and streaks', () => {
    const id = 'test-game';
    recordResult(id, { outcome: 'win', score: 10 });
    recordResult(id, { outcome: 'win', score: 30 });
    const r = recordResult(id, { outcome: 'loss', score: 20 });
    const s = getStats(id);
    expect(s).toMatchObject({ plays: 3, wins: 2, losses: 1, best: 30, streak: 0, bestStreak: 2 });
    expect(r.newBest).toBe(false);
  });
  it('supports lower-is-better scores and minimum records', () => {
    const id = 'test-time';
    recordResult(id, { outcome: 'win', score: 12.4, lowerIsBetter: true, records: { fastestMs: 400 } });
    const r = recordResult(id, { outcome: 'win', score: 9.8, lowerIsBetter: true, records: { fastestMs: 380 } });
    expect(r.newBest).toBe(true);
    expect(getStats(id)).toMatchObject({ best: 9.8, records: { fastestMs: 380 } });
  });
});

describe('seeded random numbers', () => {
  it('repeats with the same seed', () => {
    const a = createRng(77), b = createRng(77);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
});
