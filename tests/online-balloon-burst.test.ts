import { describe, expect, it } from 'vitest';
import { botPipe, type BotEnd } from '../src/platform/net/bot';
import { RaceLink, type RaceProgress } from '../src/platform/net/race';
import type { Peer } from '../src/platform/net/rooms';
import { createRng } from '../src/engine/rng';
import { BalloonAI, Field } from '../src/games/balloon-burst/field';
import { ONLINE_FIELD, fairScore, gameSeed, makeBalloonBot, type BBSettings } from '../src/games/balloon-burst/online';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two Peers joined by an in-memory pipe (ordered, small delays, held until listened). */
function pair(speed = 20): [Peer, Peer] {
  const [a, b] = botPipe(createRng(5), speed);
  const mk = (end: BotEnd, host: boolean): Peer => ({
    host, me: { name: host ? 'Host' : 'Guest', team: 'ban' }, them: { name: host ? 'Guest' : 'Host', team: 'ban' }, code: 'ABCDE',
    send: (t, d) => end.send(t, d), on: (t, cb) => end.on(t, cb), onGone: () => () => {}, close: () => {},
  });
  return [mk(a, true), mk(b, false)];
}

/** Play a whole field with the computer pin, as one side would, and return the score. */
function playField(seed: number, s: BBSettings, aiSeed: number) {
  const f = new Field(ONLINE_FIELD.w, ONLINE_FIELD.h, createRng(seed), 1, s.length, false);
  const ai = new BalloonAI(0, 'medium', createRng(aiSeed), ONLINE_FIELD.w, ONLINE_FIELD.h);
  while (!f.over) { f.update(1 / 120); ai.update(f, 1 / 120); }
  return f.scorers[0].score;
}

describe('Balloon Burst online: the same field on both devices', () => {
  it('two fields from the same game seed release identical balloons', () => {
    const seed = gameSeed(12345, 2);
    const a = new Field(ONLINE_FIELD.w, ONLINE_FIELD.h, createRng(seed), 1, 45, false);
    const b = new Field(ONLINE_FIELD.w, ONLINE_FIELD.h, createRng(seed), 1, 45, false);
    // What each balloon looked like when it first rose (id, kind, colour, x).
    const seen = (f: Field, log: Map<number, string>) => { for (const x of f.balloons) if (!log.has(x.id) && x.kind !== 'mini') log.set(x.id, `${x.kind}:${x.color}:${x.x.toFixed(3)}`); };
    const la = new Map<number, string>(), lb = new Map<number, string>();
    // One side pops balloons, the other does not: what rises stays the same.
    for (let i = 0; i < 45 * 120; i++) {
      a.update(1 / 120); b.update(1 / 120);
      if (i % 50 === 0 && a.balloons[0]) a.hit(0, a.balloons[0].x, a.balloons[0].y);
      seen(a, la); seen(b, lb);
    }
    const first = (l: Map<number, string>) => [...l.values()];
    expect(la.size).toBeGreaterThan(40);
    expect(first(la).slice(0, 40)).toEqual(first(lb).slice(0, 40));
    expect(a.targetColor).toBe(b.targetColor);
    expect(gameSeed(12345, 1)).not.toBe(gameSeed(12345, 2));
  });

  it('a fair stand-in score is in the range real play gets, and varies per match', () => {
    const rng = createRng(77);
    for (const s of [{ style: 'gun', length: 45 }, { style: 'pin', length: 30 }, { style: 'pin', length: 60 }] as BBSettings[]) {
      const xs = Array.from({ length: 12 }, (_, i) => fairScore(s, 1000 + i, rng));
      const avg = xs.reduce((p, v) => p + v, 0) / xs.length;
      if (s.style === 'gun') { expect(avg).toBeGreaterThan(150); expect(avg).toBeLessThan(500); }
      else if (s.length === 30) { expect(avg).toBeGreaterThan(250); expect(avg).toBeLessThan(800); }
      else { expect(avg).toBeGreaterThan(600); expect(avg).toBeLessThan(2000); }
      expect(new Set(xs).size).toBeGreaterThan(6);
    }
  });
});

describe('Balloon Burst online: the race between two players', () => {
  it('both start on "go", see each other live, agree on the winner, and race again after a rematch', async () => {
    const [ph, pg] = pair();
    const s: BBSettings = { style: 'pin', length: 30 };
    for (let g = 1; g <= 2; g++) {
      const host = new RaceLink(ph), guest = new RaceLink(pg);
      const both = Promise.all([new Promise<void>((r) => host.onStart(r)), new Promise<void>((r) => guest.onStart(r))]);
      const doneOf = (l: RaceLink) => new Promise<RaceProgress>((r) => l.onOpp((p) => { if (p.done) r(p); }));
      const hostSees = doneOf(host), guestSees = doneOf(guest);
      const live: number[] = [];
      host.onOpp((p) => live.push(p.score));
      guest.ready(); host.ready();
      await both;
      const seed = gameSeed(99, g);
      const hs = playField(seed, s, 1), gs = playField(seed, s, 2);
      guest.report({ score: Math.round(gs / 2), done: false });
      await wait(30);
      host.report({ score: hs, done: true });
      guest.report({ score: gs, done: true });
      const [gFinal, hFinal] = [await hostSees, await guestSees];
      expect(gFinal.score).toBe(gs);
      expect(hFinal.score).toBe(hs);
      expect(live[0]).toBe(Math.round(gs / 2));
      // Both devices decide the same way.
      const hostSays = hs > gFinal.score ? 'host' : hs < gFinal.score ? 'guest' : 'tie';
      const guestSays = hFinal.score > gs ? 'host' : hFinal.score < gs ? 'guest' : 'tie';
      expect(hostSays).toBe(guestSays);
      host.dispose(); guest.dispose();
    }
  });
});

describe('Balloon Burst online: the stand-in', () => {
  it('sends the settings, races a whole round with a believable score and pellets, and answers rematches', async () => {
    const settings: BBSettings = { style: 'gun', length: 45 };
    const peer = makeBalloonBot({ name: 'Me', team: 'ban' }, settings, 4242, 40);
    const cfg = await new Promise<{ settings: BBSettings; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg).toEqual({ settings, seed: 4242 });
    expect(peer.them.name).not.toMatch(/bot|computer/i);
    const finals: number[] = [];
    for (let g = 1; g <= 2; g++) {
      const race = new RaceLink(peer);
      const started = new Promise<void>((r) => race.onStart(r));
      const ammo: number[] = [];
      const finished = new Promise<RaceProgress>((r) => race.onOpp((p) => { if (typeof p.extra?.ammo === 'number') ammo.push(p.extra.ammo); if (p.done) r(p); }));
      race.ready();
      await started;
      const t0 = Date.now();
      const end = await finished;
      // 45 s round plus the 3-2-1, at 40× speed.
      expect(Date.now() - t0).toBeGreaterThan(((45 + 3) * 1000) / 40 - 150);
      expect(end.score).toBeGreaterThan(80);
      expect(end.score).toBeLessThan(800);
      expect(ammo[0]).toBeGreaterThan(20);
      expect(ammo[ammo.length - 1]).toBeLessThan(5);
      finals.push(end.score);
      race.report({ score: 300, done: true });
      await wait(20);
      race.dispose();
      const answered = new Promise((r) => { const off = peer.on('rematch', () => { off(); r(null); }); });
      peer.send('rematch');
      await answered;
    }
    expect(finals[0]).not.toBe(finals[1]);
    peer.close();
  }, 30000);
});
