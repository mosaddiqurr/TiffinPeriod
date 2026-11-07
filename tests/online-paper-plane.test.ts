import { describe, expect, it } from 'vitest';
import { botPipe } from '../src/platform/net/bot';
import type { Peer } from '../src/platform/net/rooms';
import { createRng } from '../src/engine/rng';
import { PlaneAI, TYPES, makeCourse, simulateThrow, throwScore, throwWind } from '../src/games/paper-plane/model';
import { PlaneRace, THROWS, botThrows, makePlaneBot, outcomeOf, parseProg, type PPSettings } from '../src/games/paper-plane/race';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await sleep(5); }
}

/** Two Peers joined by an in-memory pipe (in order, small delays). */
function pair(speed = 20): [Peer, Peer] {
  const [a, b] = botPipe(createRng(7), speed);
  const mk = (end: typeof a, host: boolean, me: string, them: string): Peer => ({
    host, me: { name: me, team: 'ban' }, them: { name: them, team: 'ban' }, code: 'TEST2',
    send: end.send, on: end.on, onGone: () => () => {}, close: () => {},
  });
  return [mk(a, true, 'Host', 'Guest'), mk(b, false, 'Guest', 'Host')];
}

const ME = { name: 'Tester', team: 'ban' };

describe('paper plane: the same course on both devices', () => {
  it('the course and each throw\'s wind come only from the seed', () => {
    for (const ch of ['distance', 'accuracy', 'obstacle'] as const) {
      expect(JSON.stringify(makeCourse(createRng(4242), ch))).toBe(JSON.stringify(makeCourse(createRng(4242), ch)));
    }
    expect(makeCourse(createRng(1)).buildings[1].top).not.toBe(makeCourse(createRng(2)).buildings[1].top);
    for (let i = 0; i < THROWS; i++) {
      expect(throwWind(99, i)).toBe(throwWind(99, i));
      expect(throwWind(99, i)).toBeGreaterThanOrEqual(-25);
      expect(throwWind(99, i)).toBeLessThanOrEqual(45);
    }
    expect(new Set([0, 1, 2, 3, 4].map((i) => throwWind(5, i))).size).toBeGreaterThan(1);
  });

  it('a simulated throw scores with the challenge\'s own scoring and leaves the course clean', () => {
    const c = makeCourse(createRng(11), 'obstacle');
    const r = simulateThrow(c, TYPES.glider, throwWind(11, 0), new PlaneAI(createRng(3), 0.75), 'obstacle');
    expect(r.score).toBe(throwScore(r.plane, 'obstacle', c));
    expect(r.seconds).toBeGreaterThan(0.2);
    expect(c.rings.every((g) => !g.taken)).toBe(true);
  });
});

describe('paper plane online race (two devices)', () => {
  it('both see each other\'s throws and agree on the result; rematch starts a new game', async () => {
    const [ph, pg] = pair();
    const host = new PlaneRace(ph), guest = new PlaneRace(pg);
    let starts = 0;
    host.onStart(() => starts++); guest.onStart(() => starts++);
    host.newGame(); guest.newGame();
    host.ready(); guest.ready();
    await until(() => starts === 2);
    host.flying(true);
    await until(() => guest.opp.flying);
    host.myThrow(120); guest.myThrow(90);
    await until(() => guest.opp.throws.length === 1 && host.opp.throws.length === 1);
    expect(guest.opp).toMatchObject({ throws: [120], best: 120, done: false, flying: false });
    host.myThrow(300); host.myThrow(40);
    guest.myThrow(310); guest.myThrow(10);
    await until(() => host.result !== null && guest.result !== null);
    expect(host.result).toBe('loss');
    expect(guest.result).toBe('win');
    expect(host.opp.throws).toEqual([90, 310, 10]);
    // A fourth throw is ignored.
    guest.myThrow(999);
    expect(guest.me.throws).toHaveLength(3);

    // Rematch: game 2, both ready again.
    host.newGame(); guest.newGame();
    expect(host.result).toBeNull();
    host.ready(); guest.ready();
    await until(() => host.started && guest.started);
    for (const s of [50, 60, 70]) { host.myThrow(s); guest.myThrow(s); }
    await until(() => host.result !== null && guest.result !== null);
    expect(host.result).toBe('tie');
    expect(guest.result).toBe('tie');
    host.dispose(); guest.dispose();
  });

  it('old-game progress is ignored after a rematch', () => {
    const p = parseProg({ score: 5, done: false, extra: { g: 1, list: '5', f: 0 } });
    expect(p).toEqual({ throws: [5], best: 5, done: false, flying: false });
    expect(outcomeOf({ throws: [1], best: 10, done: true, flying: false }, { throws: [1], best: 9, done: true, flying: false })).toBe('win');
  });
});

describe('paper plane stand-in', () => {
  const settings: PPSettings = { challenge: 'accuracy', fold: 'hawk' };

  it('its throws are real flights of the computer pilot on the same course', () => {
    const a = botThrows(777, settings, 0.75, createRng(5));
    const b = botThrows(777, settings, 0.75, createRng(5));
    expect(a).toEqual(b);
    expect(a).toHaveLength(THROWS);
    const c = makeCourse(createRng(777), 'accuracy');
    const ai = new PlaneAI(createRng(5), 0.75);
    expect(simulateThrow(c, TYPES.hawk, throwWind(777, 0), ai, 'accuracy').score).toBe(a[0].score);
  });

  it('plays a whole match at a person\'s pace and answers a rematch', async () => {
    const peer = makePlaneBot(ME, settings, 2024, 60);
    const race = new PlaneRace(peer);
    let started = 0;
    race.onStart(() => started++);
    race.newGame();
    race.ready();
    await until(() => started === 1);
    for (const s of [100, 200, 150]) race.myThrow(s);
    await until(() => race.opp.done, 8000);
    expect(race.opp.throws).toHaveLength(THROWS);
    expect(race.result).not.toBeNull();
    expect(race.opp.best).toBe(Math.max(...race.opp.throws));

    // Rematch: the stand-in agrees, then races again.
    let answered = false;
    const off = peer.on('rematch', () => { answered = true; });
    peer.send('rematch');
    await until(() => answered);
    off();
    race.newGame();
    race.ready();
    await until(() => started === 2);
    for (const s of [10, 20, 30]) race.myThrow(s);
    await until(() => race.opp.done, 8000);
    expect(race.g).toBe(2);
    expect(race.result).toBe(outcomeOf(race.me, race.opp));
    race.dispose();
    peer.close();
  });
});
