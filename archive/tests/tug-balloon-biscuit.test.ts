import { describe, expect, it } from 'vitest';
import { PARAMS, TugAI, TugModel } from '../src/games/tug-of-war/model';
import { BalloonAI, Field, comboMultiplier } from '../src/games/balloon-burst/field';
import { AirGun, RECOCK, pelletsFor } from '../src/games/balloon-burst/gun';
import { BiscuitAI, BiscuitRaceModel, COURSE, timeToHeight } from '../src/games/biscuit-race/model';
import { pendulumEnergy, stepPendulum, type Pendulum } from '../src/engine/physics';
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

/** Advance a tug model; press for `team` exactly on each beat. */
function runTug(m: TugModel, seconds: number, onBeatTeams: Array<0 | 1>) {
  let lastBeat = m.beatIndex;
  for (let i = 0; i < seconds / DT && !m.over; i++) {
    m.update(DT);
    if (m.beatIndex !== lastBeat) {
      lastBeat = m.beatIndex;
      for (const tm of onBeatTeams) m.input(tm);
    }
  }
}

describe('Tug of War model', () => {
  it('a team that pulls on every beat wins against a team that does nothing', () => {
    const m = new TugModel();
    runTug(m, 30, [0]);
    expect(m.winner).toBe(0);
    expect(m.t).toBeLessThan(20);
  });
  it('equal perfect teams stay near the centre', () => {
    const m = new TugModel();
    runTug(m, 10, [0, 1]);
    expect(Math.abs(m.x)).toBeLessThan(5);
    expect(m.winner).toBeNull();
  });
  it('a second tap on the same beat is a slip (anti-spam)', () => {
    const m = new TugModel();
    runTug(m, 1.6, []);
    // Move to just after a beat, then tap twice.
    let last = m.beatIndex;
    while (m.beatIndex === last) m.update(DT);
    last = m.beatIndex;
    expect(m.input(0).slip).toBe(false);
    expect(m.input(0).slip).toBe(true);
    expect(m.slips[0]).toBe(1);
  });
  it('mashing far from the beat makes the masher lose', () => {
    const m = new TugModel();
    for (let i = 0; i < 25 / DT && !m.over; i++) {
      m.update(DT);
      if (i % 6 === 0) m.input(0); // 20 taps per second, mostly off-beat
    }
    expect(m.winner).toBe(1);
  });
  it('assist mode rate-limits taps', () => {
    const m = new TugModel(true);
    m.update(0.1);
    const results = Array.from({ length: 10 }, () => m.input(0).judgement);
    expect(results.filter((r) => r === 'assist')).toHaveLength(PARAMS.assistRate);
  });
  it('the hard computer beats the easy computer in most matches', () => {
    let hardWins = 0;
    for (let s = 0; s < 20; s++) {
      const m = new TugModel();
      const easy = new TugAI(0, 'easy', createRng(s * 2 + 1));
      const hard = new TugAI(1, 'hard', createRng(s * 2 + 2));
      for (let i = 0; i < 60 / DT && !m.over; i++) { easy.update(m); hard.update(m); m.update(DT); }
      if (m.winner === 1) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(14);
  });
  it('a round always ends by the time limit', () => {
    const m = new TugModel();
    runTug(m, PARAMS.roundTime + 1, [0, 1]);
    expect(m.over).toBe(true);
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

describe('Biscuit Race physics', () => {
  it('the damped pendulum does not gain energy (stable integration)', () => {
    const p: Pendulum = { ax: 0, ay: 0, L: 110, theta: 0.5, omega: 0, damping: 0.2, g: 1800 };
    let e0 = pendulumEnergy(p);
    for (let i = 0; i < 1200; i++) {
      stepPendulum(p, DT);
      const e = pendulumEnergy(p);
      expect(e).toBeLessThanOrEqual(e0 * 1.002);
      e0 = Math.max(e, 0);
    }
  });
  it('the biscuit is reachable with a jump', () => {
    expect(timeToHeight(109)).not.toBeNull();
    expect(timeToHeight(400)).toBeNull();
  });
  it('a racer cannot pass the biscuit line without the biscuit', () => {
    const m = new BiscuitRaceModel(1, 'easy', createRng(1));
    m.lanes[0].racer.ctl.right = true;
    for (let i = 0; i < 10 / DT; i++) m.update(DT);
    expect(m.lanes[0].racer.x).toBeLessThanOrEqual(COURSE.line + 40);
    expect(m.lanes[0].racer.finished).toBe(false);
  });
  for (const diff of ['easy', 'medium', 'hard'] as const) {
    it(`the ${diff} computer catches the biscuit and finishes`, () => {
      let finished = 0;
      for (let s = 0; s < 6; s++) {
        const m = new BiscuitRaceModel(1, diff, createRng(100 + s));
        const ai = new BiscuitAI(0, diff, createRng(200 + s));
        for (let i = 0; i < 60 / DT && !m.done; i++) { ai.update(m, DT); m.update(DT); }
        if (m.done) finished++;
      }
      expect(finished).toBeGreaterThanOrEqual(5);
    });
  }
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
