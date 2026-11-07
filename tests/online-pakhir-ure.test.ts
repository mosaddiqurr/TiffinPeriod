import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { botPipe } from '../src/platform/net/bot';
import { RaceLink, type RaceProgress } from '../src/platform/net/race';
import type { Peer } from '../src/platform/net/rooms';
import { PakhirEngine } from '../src/games/pakhir-ure/engine';
import { ITEMS } from '../src/games/pakhir-ure/items';
import { QUICK, makePakhirBot, progressOf, raceEngine, simulateRun, type PUSettings } from '../src/games/pakhir-ure/duel';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two Peers joined by an in-memory pipe (ordered, held until someone listens). */
function peers(): [Peer, Peer] {
  const [a, b] = botPipe(createRng(5), 20);
  const mk = (end: typeof a, host: boolean): Peer => ({
    host, me: { name: host ? 'A' : 'B', team: 'ban' }, them: { name: host ? 'B' : 'A', team: 'ban' }, code: 'TEST2',
    send: (type, data) => end.send(type, data), on: (type, cb) => end.on(type, cb), onGone: () => () => {}, close: () => {},
  });
  return [mk(a, true), mk(b, false)];
}

/** The calls a player hears when they never touch the pad (tap input). */
function callsDoingNothing(s: PUSettings, seed: number, g: number): string[] {
  const e = raceEngine({ ...s, input: 'tap' }, seed, g);
  const out: string[] = [];
  let t = 0;
  let last = e.phase;
  for (let i = 0; i < 400000 && e.phase !== 'over'; i++) {
    t += 10;
    e.tick(t);
    if (e.phase !== last && e.phase === 'call' && e.item) out.push(e.item.id);
    last = e.phase;
  }
  return out;
}

describe('Pakhir Ure online: the same calls for both players', () => {
  it('the same seed and game gives the same calls, whatever each player does', () => {
    const s: PUSettings = { calls: 20, input: 'lift' };
    const a = simulateRun(s, 1234, 1, 'medium', createRng(1));
    const b = simulateRun(s, 1234, 1, 'easy', createRng(999));
    expect(a.items).toHaveLength(20);
    expect(b.items).toEqual(a.items);
    expect(callsDoingNothing(s, 1234, 1)).toEqual(a.items);
    // A rematch (game 2) gets new calls; another seed too.
    expect(simulateRun(s, 1234, 2, 'medium', createRng(1)).items).not.toEqual(a.items);
    expect(simulateRun(s, 77, 1, 'medium', createRng(1)).items).not.toEqual(a.items);
  });

  it('the number of calls comes from the settings, and the last progress says done', () => {
    for (const calls of [10, 30]) {
      const r = simulateRun({ calls, input: 'tap' }, 5, 1, 'medium', createRng(3));
      expect(r.items).toHaveLength(calls);
      const last = r.steps[r.steps.length - 1].p;
      expect(last.done).toBe(true);
      expect(last.extra).toEqual({ call: calls, of: calls });
      expect(last.score).toBe(r.final);
    }
  });

  it('the stand-in scores like the computer player at easy and medium', () => {
    // The vs-computer game: the same engine with an AI player, 20 calls.
    const vsAi = (diff: 'easy' | 'medium', seed: number) => {
      const e = new PakhirEngine({ players: [{ ai: true }], input: 'lift', lives: null, calls: 20, aiDifficulty: diff }, ITEMS, createRng(seed));
      let t = 0;
      while (e.phase !== 'over' && t < 600000) { t += 10; e.tick(t); }
      return e.players[0].score;
    };
    const avg = (f: (i: number) => number) => { let sum = 0; for (let i = 0; i < 40; i++) sum += f(i); return sum / 40; };
    for (const level of ['easy', 'medium'] as const) {
      const ours = avg((i) => simulateRun(QUICK, 100 + i, 1, level, createRng(i)).final);
      const theirs = avg((i) => vsAi(level, 100 + i));
      expect(Math.abs(ours - theirs) / theirs).toBeLessThan(0.15);
    }
    // And it takes about as long as a person: well over a second per call.
    const r = simulateRun(QUICK, 8, 1, 'medium', createRng(2));
    expect(r.steps[r.steps.length - 1].at).toBeGreaterThan(20 * 1800);
  });
});

describe('Pakhir Ure online: two devices', () => {
  it('both start together, see each other\'s progress and agree on the result', async () => {
    const [ph, pg] = peers();
    const host = new RaceLink(ph), guest = new RaceLink(pg);
    let starts = 0;
    host.onStart(() => starts++); guest.onStart(() => starts++);
    guest.ready();
    await wait(40);
    expect(starts).toBe(0); // the host is not ready yet
    host.ready();
    await wait(60);
    expect(starts).toBe(2);
    // Each plays the same game on its own and reports.
    const s: PUSettings = { calls: 10, input: 'tap' };
    const ra = simulateRun(s, 42, 1, 'medium', createRng(1));
    const rb = simulateRun(s, 42, 1, 'easy', createRng(2));
    const seenByGuest: RaceProgress[] = [];
    guest.onOpp((p) => seenByGuest.push(p));
    for (const st of ra.steps) host.report(st.p);
    for (const st of rb.steps) guest.report(st.p);
    await wait(400);
    expect(guest.opp).toEqual({ score: ra.final, done: true, extra: { call: 10, of: 10 } });
    expect(host.opp.score).toBe(rb.final);
    expect(host.opp.done).toBe(true);
    expect(seenByGuest.length).toBeGreaterThan(0);
    host.dispose(); guest.dispose();
  });

  it('a live engine reports its call number and score', () => {
    const e = raceEngine({ calls: 10, input: 'tap' }, 3, 1);
    expect(progressOf(e)).toEqual({ score: 0, done: false, extra: { call: 0, of: 10 } });
    let t = 0;
    while (e.phase !== 'call') { t += 10; e.tick(t); }
    expect(progressOf(e).extra).toEqual({ call: 1, of: 10 });
  });
});

describe('Pakhir Ure online: the quick-match stand-in', () => {
  it('sends the settings, races a whole game, and answers a rematch with a new game', async () => {
    const speed = 60;
    const peer = makePakhirBot({ name: 'Me', team: 'ban' }, QUICK, 31, speed);
    const cfg = await new Promise<{ settings: PUSettings; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg.settings).toEqual(QUICK);
    expect(cfg.seed).toBe(31);
    for (const g of [1, 2]) {
      const race = new RaceLink(peer);
      const started = new Promise<void>((r) => race.onStart(r));
      const finished = new Promise<RaceProgress>((r) => race.onOpp((p) => { if (p.done) r(p); }));
      race.ready();
      await started;
      const last = await finished;
      expect(last.extra).toEqual({ call: 20, of: 20 });
      expect(last.score).toBeGreaterThan(500);
      // My own game, the same calls.
      const mine = simulateRun(cfg.settings, cfg.seed, g, 'medium', createRng(g));
      race.report({ score: mine.final, done: true });
      race.dispose();
      if (g === 1) {
        const answered = new Promise((r) => { const off = peer.on('rematch', () => { off(); r(null); }); });
        peer.send('rematch');
        await answered;
      }
    }
    peer.close();
  }, 30000);
});
