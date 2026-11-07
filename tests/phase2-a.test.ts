import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { DESK, PENS, PenAI, PenWorld, edgeDistance, startPoses, simulate } from '../src/games/pen-fight/model';
import { CHANT_BN, Caller, WalkerAI, isCaught, stepWalker, type Walker } from '../src/games/elonti-belonti/model';

const DT = 1 / 120;

describe('Pen Fight physics', () => {
  const pens = [PENS.classic, PENS.gel];
  const fresh = () => new PenWorld(pens, startPoses());
  it('a still desk stays still, and the same flick always gives the same result', () => {
    const w = fresh();
    w.settle();
    expect(w.out).toEqual([false, false]);
    const a = simulate(w, 0, { t: 0.1, dir: 0.2, power: 0.8 }), b = simulate(w, 0, { t: 0.1, dir: 0.2, power: 0.8 });
    expect(a.poses).toEqual(b.poses);
  });
  it('a light pen slides further than a heavy one from the same flick, and stops by friction', () => {
    const slide = (id: 'classic' | 'gel') => {
      const w = new PenWorld([PENS[id], PENS.gel], [{ x: -30, y: 0, a: Math.PI / 2 }, { x: 30, y: 20, a: 0 }]);
      w.flick(0, { t: 0, dir: 0, power: 0.5 });
      w.settle();
      expect(w.settled()).toBe(true);
      return w.pens[0].x + 30;
    };
    const light = slide('classic'), heavy = slide('gel');
    expect(light).toBeGreaterThan(heavy * 1.3);
    expect(heavy).toBeGreaterThan(4);
  });
  it('a flick in the middle pushes straight; near an end it spins', () => {
    const w = fresh();
    const mid = w.clone(); mid.flick(0, { t: 0, dir: 0, power: 0.6 });
    const end = w.clone(); end.flick(0, { t: 0.45, dir: 0, power: 0.6 });
    expect(Math.abs(mid.pens[0].w)).toBeLessThan(0.01);
    expect(Math.abs(end.pens[0].w)).toBeGreaterThan(5);
    expect(Math.hypot(end.pens[0].vx, end.pens[0].vy)).toBeLessThan(Math.hypot(mid.pens[0].vx, mid.pens[0].vy));
  });
  it('pens bounce off each other: the one hit moves, a hit near its end turns it', () => {
    const w = new PenWorld([PENS.classic, PENS.classic], [{ x: -10, y: 0, a: Math.PI / 2 }, { x: 5, y: 0, a: Math.PI / 2 }]);
    w.flick(0, { t: 0, dir: 0, power: 0.7 });
    w.settle();
    expect(w.pens[1].x - 5).toBeGreaterThan(8);
    const v = new PenWorld([PENS.classic, PENS.classic], [{ x: -10, y: 5, a: Math.PI / 2 }, { x: 5, y: 0, a: Math.PI / 2 }]);
    v.flick(0, { t: 0, dir: 0, power: 0.7 });
    v.settle();
    expect(Math.abs(v.pens[1].a - Math.PI / 2)).toBeGreaterThan(0.2);
  });
  it('a pen hanging over the edge stays in until its middle goes past', () => {
    const w = new PenWorld(pens, [{ x: DESK.w / 2 - 2, y: 0, a: 0 }, { x: -20, y: 0, a: 0 }]);
    w.step();
    expect(w.out[0]).toBe(false);
    w.flick(0, { t: 0, dir: 0, power: 0.5 });
    w.settle();
    expect(w.out[0]).toBe(true);
    expect(w.pens[0].fallN).toEqual([1, 0]);
  });
  it('the computer plans, returns a flick, and against itself finishes rounds', () => {
    const rng = createRng(3);
    let finished = 0;
    for (let g = 0; g < 4; g++) {
      const w = new PenWorld(pens, startPoses(rng));
      let turn = g % 2;
      for (let k = 0; k < 30; k++) {
        const ai = new PenAI(turn, 'medium', rng);
        ai.start(w);
        let f = null;
        for (let i = 0; i < 100 && !f; i++) f = ai.work(20);
        expect(f).not.toBeNull();
        w.flick(turn, f!);
        w.settle();
        if (w.out[0] || w.out[1]) { finished++; break; }
        turn = 1 - turn;
      }
    }
    expect(finished).toBe(4);
    expect(edgeDistance({ x: 0, y: 0, a: 0 })).toBe(DESK.d / 2);
  }, 60000);
});

describe('Elonti Belonti', () => {
  it('the chant has nine words and the caller turns at the end', () => {
    expect(CHANT_BN).toHaveLength(9);
    const c = new Caller(createRng(1));
    let turned = false;
    for (let i = 0; i < 2000 && !turned; i++) turned = c.update(DT) === 'turned';
    expect(turned).toBe(true);
    expect(c.state).toBe('watch');
  });
  it('a walker who is still moving when the caller watches is caught', () => {
    const c = new Caller(createRng(1));
    c.state = 'watch';
    expect(isCaught({ x: 0, v: 50, hold: true, caught: 0 }, c)).toBe(true);
    expect(isCaught({ x: 0, v: 0, hold: false, caught: 0 }, c)).toBe(false);
  });
  it('a hard computer walker is rarely caught and makes progress', () => {
    const c = new Caller(createRng(7));
    const w: Walker = { x: 0, v: 0, hold: false, caught: 0 };
    const ai = new WalkerAI('hard', createRng(8));
    for (let i = 0; i < 60 / DT; i++) {
      c.update(DT); ai.update(w, c); stepWalker(w, DT);
      if (isCaught(w, c)) { w.caught++; w.x = 0; w.v = 0; }
    }
    expect(w.caught).toBeLessThanOrEqual(3);
    expect(w.x).toBeGreaterThan(200);
  });
});

