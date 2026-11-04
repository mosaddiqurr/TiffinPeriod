import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { VENUES, aiBat, aiBowl, ballAt, deliveryTime, hitsStumps, judgeSwing, launchFor, makeDelivery, simulateShot, type Launch } from '../src/games/street-cricket/engine';

const noFielders = (id: keyof typeof VENUES) => ({ ...VENUES[id], fielders: [] as Array<[number, number]> });

describe('street cricket: delivery', () => {
  it('the ball bounces at the chosen length and reaches the batter', () => {
    const v = VENUES['short-pitch'];
    const d = makeDelivery(v, 'good', 'middle', false, createRng(1), 1.2);
    const T = deliveryTime(v, d);
    const atBounce = ballAt(v, d, (v.pitch - d.length) / d.speed);
    expect(atBounce.h).toBeLessThan(0.05);
    expect(ballAt(v, d, T).z).toBeCloseTo(0, 5);
    expect(ballAt(v, d, 0).h).toBeCloseTo(2, 5);
  });
  it('a full ball on middle stump would hit the stumps; a wide one would not', () => {
    const v = VENUES['short-pitch'];
    const straight = { speed: 18, length: 1.2, line: 0, swing: 0, release: 0 };
    const wide = { ...straight, line: 0.6 };
    expect(hitsStumps(v, straight)).toBe(true);
    expect(hitsStumps(v, wide)).toBe(false);
  });
});

describe('street cricket: batting', () => {
  it('timing windows: clean, edge, miss; no shot is a miss', () => {
    expect(judgeSwing('drive', 0.02).contact).toBe('clean');
    expect(judgeSwing('drive', 0.19).contact).toBe('edge');
    expect(judgeSwing('drive', 0.4).contact).toBe('miss');
    expect(judgeSwing('none', 0).contact).toBe('miss');
  });
  it('early goes to the leg side, late goes to the off side', () => {
    const v = VENUES['tape-tennis'];
    const d = { speed: 20, length: 5, line: 0, swing: 0, release: 0 };
    let early = 0, late = 0;
    for (let i = 0; i < 50; i++) {
      early += launchFor('drive', 'clean', 0.6, -0.08, v, d, createRng(i)).dir;
      late += launchFor('drive', 'clean', 0.6, 0.08, v, d, createRng(i)).dir;
    }
    expect(early).toBeLessThan(0);
    expect(late).toBeGreaterThan(0);
  });
  it('a loft goes higher than a drive', () => {
    const v = VENUES['short-pitch'];
    const d = { speed: 18, length: 4, line: 0, swing: 0, release: 0 };
    expect(launchFor('loft', 'clean', 0.9, 0, v, d, createRng(1)).elev).toBeGreaterThan(launchFor('drive', 'clean', 0.9, 0, v, d, createRng(1)).elev + 0.15);
  });
});

describe('street cricket: local rules', () => {
  const big: Launch = { v: 30, elev: 0.6, dir: 0 };
  it('short-pitch: a six is OUT', () => {
    expect(simulateShot(noFielders('short-pitch'), big, createRng(1)).out).toBe('six-out');
  });
  it('tape tennis: over the end on the full is a six', () => {
    const r = simulateShot(noFielders('tape-tennis'), { v: 34, elev: 0.6, dir: 0 }, createRng(1));
    expect(r.label).toBe('six');
    expect(r.runs).toBe(6);
  });
  it('rooftop: off the roof is OUT by default', () => {
    expect(simulateShot(noFielders('rooftop'), big, createRng(1)).out).toBe('off-roof');
  });
  it('rooftop: hitting the water tank gives 2 runs', () => {
    const v = noFielders('rooftop');
    const dir = Math.atan2(v.tank!.x, v.tank!.y);
    const r = simulateShot(v, { v: 16, elev: 0.08, dir }, createRng(1));
    expect(r.label).toBe('tank');
    expect(r.runs).toBe(2);
  });
  it('goli: a high ball over the side wall goes into a house: OUT', () => {
    expect(simulateShot(noFielders('goli'), { v: 22, elev: 0.7, dir: 0.9 }, createRng(1)).out).toBe('house');
  });
  it('a ground ball to the boundary is four', () => {
    const r = simulateShot(noFielders('short-pitch'), { v: 26, elev: 0.02, dir: 0.3 }, createRng(1));
    expect(r.label).toBe('four');
    expect(r.runs).toBe(4);
  });
  it('a soft block scores at most a run or two', () => {
    const r = simulateShot(noFielders('short-pitch'), { v: 4, elev: 0, dir: 0 }, createRng(1));
    expect(r.runs).toBeLessThanOrEqual(1);
    expect(r.out).toBeNull();
  });
});

describe('street cricket: whole overs', () => {
  for (const id of Object.keys(VENUES) as Array<keyof typeof VENUES>) {
    it(`${id}: the computer scores runs and loses wickets at a playable rate`, () => {
      const v = VENUES[id];
      const rng = createRng(3);
      let runs = 0, outs = 0;
      const N = 300;
      for (let i = 0; i < N; i++) {
        const d = aiBowl(v, 'medium', rng);
        const b = aiBat(v, d, 'medium', rng);
        const j = judgeSwing(b.shot, b.dt);
        if (j.contact === 'miss') { if (hitsStumps(v, d)) outs++; continue; }
        const r = simulateShot(v, launchFor(b.shot, j.contact, j.quality, b.dt, v, d, rng), rng);
        runs += r.runs;
        if (r.out) outs++;
        expect(r.frames.length).toBeGreaterThan(0);
      }
      expect(runs / N).toBeGreaterThan(0.4);
      expect(runs / N).toBeLessThan(3.5);
      expect(N / Math.max(1, outs)).toBeGreaterThan(2.5);
    });
  }
});
