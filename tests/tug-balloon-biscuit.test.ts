import { describe, expect, it } from 'vitest';
import { BalloonAI, Field, comboMultiplier } from '../src/games/balloon-burst/field';
import { AirGun, RECOCK, pelletsFor } from '../src/games/balloon-burst/gun';
import { judgeBeat, RateLimiter } from '../src/engine/timing';
import { createRng } from '../src/engine/rng';

const DT = 1 / 120;

describe('timing helpers', () => {
  it('judges beat offsets', () => {
    expect(judgeBeat(1.03, 0, 0.5).judgement).toBe('perfect');
    expect(judgeBeat(1.12, 0, 0.5).judgement).toBe('good');
    expect(judgeBeat(1.25, 0, 0.5).judgement).toBe('miss');
  });
  it('rate-limits input', () => {
    const r = new RateLimiter(3);
    expect([r.allow(0), r.allow(0.1), r.allow(0.2), r.allow(0.3)]).toEqual([true, true, true, false]);
    expect(r.allow(1.2)).toBe(true);
  });
});

describe('Balloon Burst field', () => {
  it('two fields with the same seed produce the same balloons (fair split screen)', () => {
    const a = new Field(400, 700, createRng(42), 1, 30, false);
    const b = new Field(400, 700, createRng(42), 1, 30, false);
    for (let i = 0; i < 600; i++) { a.update(DT); b.update(DT); }
    expect(a.balloons.map((x) => [x.kind, x.color, Math.round(x.x), Math.round(x.y)])).toEqual(b.balloons.map((x) => [x.kind, x.color, Math.round(x.x), Math.round(x.y)]));
    expect(a.balloons.length).toBeGreaterThan(3);
  });
  it('pops a balloon, builds a combo and penalises empty taps', () => {
    const f = new Field(500, 700, createRng(1), 1, 30, false);
    f.update(DT);
    f.balloons = [];
    for (const [id, x] of [[901, 120], [902, 360]] as const) {
      f.balloons.push({ id, kind: 'normal', color: 'blue', x, y: 300, r: 40, vy: -10, vx: 0, sway: 0, swayF: 0, phase: 0, hp: 1, hitFlash: 0 });
    }
    const targets = [...f.balloons];
    const r1 = f.hit(0, targets[0].x, targets[0].y);
    expect(r1.type).toBe('pop');
    const r2 = f.hit(0, targets[1].x, targets[1].y);
    expect(r2.type === 'pop' && r2.combo).toBe(2);
    const before = f.scorers[0].score;
    const miss = f.hit(0, -100, -100);
    expect(miss.type).toBe('miss');
    expect(f.scorers[0].combo).toBe(0);
    expect(f.scorers[0].score).toBe(before - 2);
  });
  it('a tough balloon needs two hits', () => {
    const f = new Field(500, 700, createRng(1), 1, 30, false);
    f.balloons.push({ id: 999, kind: 'tough', color: 'red', x: 200, y: 300, r: 54, vy: -10, vx: 0, sway: 0, swayF: 0, phase: 0, hp: 2, hitFlash: 0 });
    expect(f.hit(0, 200, 300).type).toBe('damage');
    expect(f.hit(0, 200, 300).type).toBe('pop');
  });
  it('the rain cloud costs points and breaks the combo', () => {
    const f = new Field(500, 700, createRng(1), 1, 30, false);
    f.scorers[0].score = 40;
    f.scorers[0].combo = 6;
    f.balloons.push({ id: 998, kind: 'cloud', color: 'red', x: 100, y: 100, r: 42, vy: -10, vx: 0, sway: 0, swayF: 0, phase: 0, hp: 1, hitFlash: 0 });
    expect(f.hit(0, 100, 100).type).toBe('cloud');
    expect(f.scorers[0]).toMatchObject({ score: 25, combo: 0 });
  });
  it('limits taps to 10 per second', () => {
    const f = new Field(500, 700, createRng(1), 1, 30, false);
    f.update(0.5);
    const res = Array.from({ length: 14 }, () => f.hit(0, -50, -50).type);
    expect(res.filter((t) => t === 'ignored')).toHaveLength(4);
  });
  it('combo multiplier steps up and caps at ×3', () => {
    expect([1, 5, 10, 15, 40].map(comboMultiplier)).toEqual([1, 1.5, 2, 2.5, 3]);
  });
  it('the round ends and the computer scores on a shared field', () => {
    const f = new Field(600, 700, createRng(3), 2, 20, false);
    const ai = new BalloonAI(1, 'medium', createRng(4), 600, 700);
    for (let i = 0; i < 21 / DT; i++) { f.update(DT); ai.update(f, DT); }
    expect(f.over).toBe(true);
    expect(f.scorers[1].pops).toBeGreaterThan(5);
  });
});

describe('Balloon Burst mela gun', () => {
  it('drags the sight with the finger, fires once per cock, and runs out of pellets', () => {
    const g = new AirGun(400, 800, pelletsFor(30));
    expect(g.ammo).toBe(20);
    const y0 = g.sy;
    g.grab(1, 100, 500); g.move(1, 100, 400, 1);
    expect(g.sy).toBeLessThan(y0 - 100);
    g.move(2, 0, 0, 1); // another finger does nothing
    expect(g.sy).toBeLessThan(y0 - 100);
    const p = g.fire(0)!;
    expect(p).not.toBeNull();
    expect(p.dur).toBeGreaterThan(0);
    expect(g.fire(0.05)).toBeNull(); // still re-cocking
    g.update(RECOCK + 0.01);
    expect(g.fire(1)).not.toBeNull();
    while (g.ammo > 0) { g.update(1); g.fire(2); }
    g.update(1);
    expect(g.empty).toBe(true);
    expect(g.fire(3)).toBeNull();
  });
  it('the sight stays above the counter and inside the stall', () => {
    const g = new AirGun(400, 800, 10);
    g.nudge(-999, 9999);
    expect(g.sx).toBeGreaterThanOrEqual(16);
    expect(g.sy).toBeLessThan(800 - g.barrel);
  });
});
