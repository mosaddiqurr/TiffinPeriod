import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { botPipe, type BotEnd } from '../src/platform/net/bot';
import { RaceLink, type RaceProgress } from '../src/platform/net/race';
import type { Peer } from '../src/platform/net/rooms';
import { BoatAI, newBoat, stepBoat, stepObstacles } from '../src/games/paper-boat/model';
import { decide, makeBoatBot, makeCourse, progress, rankKey, report, START_X, type BoatReport, type BoatStatus } from '../src/games/paper-boat/race';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 15000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(10); } };

function asPeer(end: BotEnd, host: boolean): Peer {
  return { host, me: { name: host ? 'A' : 'B', team: 'ban' }, them: { name: host ? 'B' : 'A', team: 'ban' }, code: '', send: end.send, on: end.on, onGone: () => () => {}, close: () => {} };
}

/** Sail one boat to the end with the computer's steering, as a device would. */
function sail(seed: number, g: number, skill: number, aiSeed: number): BoatReport {
  const obs = makeCourse(seed, g, { stream: 'normal' });
  const b = newBoat(START_X);
  const ai = new BoatAI(createRng(aiSeed), skill);
  let t = 0;
  let st: BoatStatus = 0;
  while (st === 0) {
    t += 1 / 120;
    stepObstacles(obs, 1 / 120); ai.update(b, obs); stepBoat(b, obs, 1 / 120);
    st = b.finished ? 1 : b.sunk ? 2 : t >= 120 ? 3 : 0;
  }
  return report(g, b, st, t);
}

const rep = (st: BoatStatus, t: number, y: number): BoatReport => ({ g: 1, x: 300, y, h: 0, soak: 0, st, t, bumps: 0 });

describe('Paper Boat online: rules', () => {
  it('ranks like the offline race: finished by time, then afloat, then sunk, by distance', () => {
    expect(decide(rep(1, 4500, 0), rep(1, 4600, 0))).toBe('win');
    expect(decide(rep(1, 4600, 0), rep(1, 4500, 0))).toBe('loss');
    expect(decide(rep(1, 4500, 0), rep(1, 4500, 0))).toBe('tie');
    expect(decide(rep(1, 11000, 0), rep(3, 12000, 50))).toBe('win');
    expect(decide(rep(3, 12000, 800), rep(2, 3000, 100))).toBe('win');
    expect(decide(rep(2, 3000, 900), rep(2, 4000, 1200))).toBe('win');
    // Both devices always reach mirror results.
    for (let i = 0; i < 200; i++) {
      const r = createRng(i);
      const a = rep(r.int(1, 3) as BoatStatus, r.int(3000, 12000), r.int(0, 4000));
      const b = rep(r.int(1, 3) as BoatStatus, r.int(3000, 12000), r.int(0, 4000));
      const m = { win: 'loss', loss: 'win', tie: 'tie' } as const;
      expect(decide(b, a)).toBe(m[decide(a, b)]);
      expect(rankKey(a)).toBeGreaterThanOrEqual(0);
    }
  });

  it('both devices build the same course from the seed; a rematch is a new course; wild is busier', () => {
    expect(makeCourse(42, 1, { stream: 'normal' })).toEqual(makeCourse(42, 1, { stream: 'normal' }));
    expect(makeCourse(42, 2, { stream: 'normal' })).not.toEqual(makeCourse(42, 1, { stream: 'normal' }));
    let n = 0, w = 0;
    for (let s = 1; s <= 20; s++) { n += makeCourse(s, 1, { stream: 'normal' }).length; w += makeCourse(s, 1, { stream: 'wild' }).length; }
    expect(w).toBeGreaterThan(n * 1.2);
  });

  it('reports are integers and progress runs 0 to 1000', () => {
    const b = newBoat(START_X);
    const r = report(1, b, 0, 1.234);
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
    expect(progress(b.y)).toBe(0);
    expect(progress(0)).toBe(1000);
  });
});

describe('Paper Boat online: two devices', () => {
  it('ready → go on both, live ghost reports, and the same result on both sides', async () => {
    const [ea, eb] = botPipe(createRng(5), 10);
    const A = asPeer(ea, true), B = asPeer(eb, false);
    const ra = new RaceLink(A), rb = new RaceLink(B);
    let started = 0;
    ra.onStart(() => started++); rb.onStart(() => started++);
    const seenA: BoatReport[] = [], seenB: BoatReport[] = [];
    ra.onOpp((p: RaceProgress) => seenA.push(p.extra as BoatReport));
    rb.onOpp((p: RaceProgress) => seenB.push(p.extra as BoatReport));
    rb.ready(); ra.ready();
    await until(() => started === 2);
    const fa = sail(77, 1, 0.9, 1), fb = sail(77, 1, 0.7, 2);
    // A few live reports, then the final one.
    ra.report({ score: 300, done: false, extra: { ...fa, st: 0, y: 2800 } });
    rb.report({ score: 250, done: false, extra: { ...fb, st: 0, y: 3000 } });
    await wait(300);
    ra.report({ score: progress(fa.y), done: true, extra: fa });
    rb.report({ score: progress(fb.y), done: true, extra: fb });
    await until(() => ra.opp.done && rb.opp.done);
    expect(seenA.length).toBeGreaterThanOrEqual(2);
    expect(seenA[0].y).toBe(3000);
    const finalA = ra.opp.extra as BoatReport, finalB = rb.opp.extra as BoatReport;
    expect(finalA).toEqual(fb);
    expect(finalB).toEqual(fa);
    const m = { win: 'loss', loss: 'win', tie: 'tie' } as const;
    expect(decide(fb, finalB)).toBe(m[decide(fa, finalA)]);
    ra.dispose(); rb.dispose();
  });
});

describe('Paper Boat online: the stand-in', () => {
  it('races the same course at (sped-up) real time, reports a moving boat, finishes, and plays a rematch', async () => {
    const peer = makeBoatBot({ name: 'Me', team: 'ban' }, { stream: 'normal' }, 1234, 25);
    expect(peer.them.name).not.toMatch(/bot|computer/i);
    const cfg = await new Promise<{ seed: number }>((r) => { const off = peer.on('cfg', (c) => { off(); r(c); }); });
    expect(cfg.seed).toBe(1234);
    for (const g of [1, 2]) {
      const race = new RaceLink(peer);
      const seen: BoatReport[] = [];
      let started = false;
      race.onStart(() => { started = true; });
      race.onOpp((p) => seen.push(p.extra as BoatReport));
      race.ready();
      await until(() => started);
      await until(() => race.opp.done && (race.opp.extra as BoatReport).g === g, 20000);
      const fin = race.opp.extra as BoatReport;
      expect(fin.g).toBe(g);
      expect(seen.length).toBeGreaterThan(8); // a live ghost, not a jump to the end
      const ys = seen.map((s) => s.y);
      expect(ys[0]).toBeGreaterThan(ys[ys.length - 1]);
      expect([1, 2, 3]).toContain(fin.st);
      // My own (slow) boat: did not finish.
      race.report({ score: 100, done: true, extra: { g, x: 300, y: 3600, h: 0, soak: 10, st: 3, t: 12000, bumps: 0 } });
      if (fin.st !== 2) expect(decide(rep(3, 12000, 3600), fin)).toBe('loss');
      race.dispose();
      if (g === 1) {
        const back = new Promise<void>((r) => { const off = peer.on('rematch', () => { off(); r(); }); });
        peer.send('rematch');
        await back;
      }
    }
    peer.close();
  }, 60000);

  it('once I finish first, the stand-in stops after the grace time', async () => {
    const peer = makeBoatBot({ name: 'Me', team: 'ban' }, { stream: 'wild' }, 99, 25);
    const race = new RaceLink(peer);
    let started = false;
    race.onStart(() => { started = true; });
    race.ready();
    await until(() => started);
    await wait(250); // the countdown at 25× speed
    race.report({ score: 1000, done: true, extra: { g: 1, x: 300, y: 0, h: 0, soak: 5, st: 1, t: 500, bumps: 0 } });
    await until(() => race.opp.done, 10000);
    const fin = race.opp.extra as BoatReport;
    expect(fin.st).toBe(3);
    expect(fin.t).toBeLessThan(2000); // about 8 s after it heard, not 120 s
    expect(decide(rep(1, 500, 0), fin)).toBe('win');
    race.dispose();
    peer.close();
  });
});
