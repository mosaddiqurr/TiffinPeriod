import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../src/engine/rng';
import {
  FIELD, Play, aiBat, aiDelivery, ballOnPath, judge, launch, makeDelivery, plan,
  type Diff, type Launch,
} from '../src/games/short-pitch/sim';

// One ball between two computer players, with the same rules as the game screen.
function simBall(diff: Diff, rng: Rng) {
  const p = plan(aiDelivery(diff, rng));
  if (!p.reachable) return { kind: 'wide' as const, runs: 1, legal: false };
  const a = aiBat(p, diff, rng);
  const pressT = p.tContact + a.dt;
  const j = pressT > p.tLate ? { timing: 'miss' as const, q: 0 } : judge(a.shot, a.dt, p);
  if (j.timing === 'miss') return p.hitsStumps ? { kind: 'bowled' as const, runs: 0, legal: true } : { kind: 'dot' as const, runs: 0, legal: true };
  const l = launch(a.shot, a.aim, a.dt, j, p, rng);
  const at = ballOnPath(p, Math.max(pressT, p.tContact));
  const pl = new Play(l, rng, 0.75, { x: at.x, y: Math.max(0.3, at.y), h: Math.max(0.2, at.h) });
  for (let i = 0; i < 120 * 25 && !pl.dead; i++) {
    if (pl.wantRuns === 0 && (!pl.running || pl.runners[0].p > 0.72) && pl.safeToRun(0.28)) pl.callRun();
    pl.step(1 / 120);
  }
  const runs = pl.four ? 4 : pl.out === 'caught' || pl.out === 'six-out' ? 0 : pl.runs;
  return { kind: (pl.four ? 'four' : pl.out ?? (runs ? 'runs' : 'dot')) as string, runs, legal: true };
}

function runPlay(l: Launch, seed: number, from?: { x: number; y: number; h: number }, onStep?: (p: Play) => void) {
  const pl = new Play(l, createRng(seed), 0.75, from);
  for (let i = 0; i < 120 * 25 && !pl.dead; i++) { onStep?.(pl); pl.step(1 / 120); }
  return pl;
}

describe('short-pitch: the delivery', () => {
  const rng = () => createRng(5);
  it('a full ball on the stumps hits them; the batter must play it', () => {
    const d = makeDelivery('medium', 0, 0.9, rng(), 1.15);
    d.swing = 0; d.rx = 0; d.tx = 0;
    const p = plan(d);
    expect(p.hitsStumps).toBe(true);
    expect(p.reachable).toBe(true);
    expect(p.tContact).toBeLessThan(p.tLate);
    expect(p.tLate).toBeLessThan(p.tStumps);
  });
  it('a good-length ball bounces before it reaches the bat', () => {
    const d = makeDelivery('medium', 0, 3.2, rng(), 1.15);
    d.swing = 0;
    const p = plan(d);
    expect(p.bounceT).toBeLessThan(p.tContact);
    expect(p.at.h).toBeGreaterThan(0.3);
  });
  it('a ball far outside off stump cannot be reached (a wide)', () => {
    const d = makeDelivery('slow', 1.5, 3, rng(), 1.15);
    d.swing = 0; d.tx = 1.6;
    expect(plan(d).reachable).toBe(false);
  });
  it('spin turns the ball after the bounce: off spin to the leg side, leg spin to the off side', () => {
    const base = (type: 'offspin' | 'legspin') => { const d = makeDelivery(type, 0.1, 3.5, rng(), 1.15); d.tx = 0.1; d.rx = 0; return plan(d); };
    const off = base('offspin'), leg = base('legspin');
    expect(off.at.x).toBeLessThan(0.1);
    expect(leg.at.x).toBeGreaterThan(0.1);
  });
  it('fast bowling arrives sooner than slow bowling', () => {
    const f = plan({ ...makeDelivery('fast', 0, 3, rng(), 1.15), swing: 0 });
    const s = plan({ ...makeDelivery('slow', 0, 3, rng(), 1.15), swing: 0 });
    expect(f.tContact).toBeLessThan(s.tContact);
  });
});

describe('short-pitch: timing and direction', () => {
  const p = plan({ ...makeDelivery('medium', 0.1, 3, createRng(9), 1.15), swing: 0 });
  it('grades the timing', () => {
    expect(judge('ground', 0, p).timing).toBe('perfect');
    expect(judge('ground', -0.06, p).timing).toBe('good');
    expect(judge('ground', -0.12, p).timing).toBe('early');
    expect(judge('ground', 0.12, p).timing).toBe('late');
    expect(judge('ground', 0.19, p).timing).toBe('edge');
    expect(judge('ground', -0.4, p).timing).toBe('miss');
  });
  it('a larger scale (easy) widens the windows', () => {
    expect(judge('ground', -0.1, p).timing).toBe('early');
    expect(judge('ground', -0.1, p, 1.3).timing).toBe('good');
    expect(judge('ground', 0.19, p, 1.3).timing).toBe('late');
  });
  it('the stick direction sends the ball that way', () => {
    const j = { timing: 'perfect' as const, q: 1 };
    const straight = launch('ground', 0, 0, j, p, createRng(1));
    const off = launch('ground', Math.PI / 2, 0, j, p, createRng(1));
    const leg = launch('ground', -Math.PI / 2, 0, j, p, createRng(1));
    expect(Math.abs(straight.dir)).toBeLessThan(0.3);
    expect(off.dir).toBeGreaterThan(1.2);
    expect(leg.dir).toBeLessThan(-1.2);
  });
  it('with no direction, early timing pulls to the leg side and late timing pushes to the off side', () => {
    const early = launch('ground', null, -0.1, { timing: 'early', q: 0.4 }, p, createRng(1));
    const late = launch('ground', null, 0.1, { timing: 'late', q: 0.4 }, p, createRng(1));
    expect(early.dir).toBeLessThan(late.dir);
  });
  it('a loft goes up; a ground shot stays low', () => {
    const j = { timing: 'perfect' as const, q: 1 };
    expect(launch('loft', 0, 0, j, p, createRng(2)).elev).toBeGreaterThan(0.4);
    expect(launch('ground', 0, 0, j, p, createRng(2)).elev).toBeLessThan(0.12);
  });
});

describe('short-pitch: para rules for the ball in play', () => {
  it('over the rope on the full is OUT (six is out)', () => {
    const pl = runPlay({ v: 32, elev: 0.6, dir: 2.0 }, 1);
    expect(pl.out).toBe('six-out');
    expect(pl.four).toBe(false);
  });
  it('a hard shot along the ground into a gap is FOUR', () => {
    // Between point and third man, very hard and flat
    const pl = runPlay({ v: 40, elev: 0.02, dir: 1.95 }, 3);
    expect(pl.out).toBeNull();
    expect(pl.four).toBe(true);
  });
  it('a soft push with greedy running gives a run out', () => {
    let outs = 0;
    for (let s = 0; s < 30; s++) {
      const pl = runPlay({ v: 4, elev: 0.02, dir: 0.3 }, s, undefined, (p) => { if (p.wantRuns === 0) p.callRun(); });
      if (pl.out === 'run-out') outs++;
    }
    expect(outs).toBeGreaterThan(15);
  });
  it('lofted shots at fielders are sometimes caught and sometimes dropped', () => {
    let caught = 0, dropped = 0;
    for (let s = 0; s < 120; s++) {
      const r = createRng(100 + s);
      const pl = new Play({ v: r.range(11, 16), elev: r.range(0.45, 0.6), dir: r.range(-2.4, 2.4) }, r);
      let drop = false;
      for (let i = 0; i < 3000 && !pl.dead; i++) { pl.step(1 / 120); if (pl.takeEvents().some((e) => e.type === 'drop')) drop = true; }
      if (pl.out === 'caught') caught++;
      if (drop) dropped++;
    }
    expect(caught).toBeGreaterThan(5);
    expect(dropped).toBeGreaterThan(0);
  });
  it('completed runs count, and the batters change ends', () => {
    const pl = runPlay({ v: 13, elev: 0.03, dir: 2.6 }, 4, undefined, (p) => { if (p.wantRuns === 0 && !p.running && p.runs < 1) p.callRun(); });
    if (!pl.out) {
      expect(pl.runs).toBeGreaterThanOrEqual(1);
      expect(pl.runners[0].end).toBe(1);
    }
  });
  it('the ball becomes dead when a fielder holds it and nobody runs', () => {
    const pl = runPlay({ v: 6, elev: 0.02, dir: 0.2 }, 8);
    expect(pl.dead).toBe(true);
    expect(pl.t).toBeLessThan(20);
  });
  it('the boundary is a circle of the field radius', () => {
    const pl = runPlay({ v: 40, elev: 0.02, dir: 1.95 }, 3);
    expect(Math.hypot(pl.ball.x, pl.ball.y)).toBeGreaterThanOrEqual(FIELD.radius - 0.5);
  });
});

describe('short-pitch: computer against computer', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Diff[]) {
    it(`${diff}: scoring is realistic for para cricket`, () => {
      const rng = createRng(2024);
      let runs = 0, balls = 0, wkts = 0;
      const kinds: Record<string, number> = {};
      for (let i = 0; i < 1500; i++) {
        const b = simBall(diff, rng);
        runs += b.runs;
        if (b.legal) balls++;
        kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
        if (['bowled', 'caught', 'six-out', 'run-out'].includes(b.kind)) wkts++;
      }
      const rpb = runs / balls, bpw = balls / Math.max(1, wkts);
      console.log(diff, { rpb: rpb.toFixed(2), bpw: bpw.toFixed(1), ...kinds });
      expect(rpb).toBeGreaterThan(0.4);
      expect(rpb).toBeLessThan(2);
      expect(bpw).toBeGreaterThan(3);
      expect(bpw).toBeLessThan(20);
      expect(kinds.four ?? 0).toBeGreaterThan(20);
      expect((kinds['six-out'] ?? 0) / 1500).toBeLessThan(0.12);
      expect((kinds.wide ?? 0) / 1500).toBeLessThan(0.12);
    });
  }
});
