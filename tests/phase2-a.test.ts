import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { BENCH, PenAI, PenWorld, START, candidates, inBench, simulate } from '../src/games/pen-fight/model';
import { HopAI, hop, newHopper, stepHopper } from '../src/games/sack-race/model';
import { PairAI, newPair, stepFoot, stepPair } from '../src/games/three-legged/model';
import { SPOON, SpoonAI, newRunner, stepRunner } from '../src/games/spoon-marble/model';
import { CHANT_BN, Caller, WalkerAI, isCaught, stepWalker, type Walker } from '../src/games/elonti-belonti/model';
import { ChairsModel } from '../src/games/musical-chairs/model';
import { BlindAI, HB, friendShout, newBlind, placePot, relAngle, stepBlind, swing } from '../src/games/haari-bhanga/model';

const DT = 1 / 120;

describe('Pen Fight physics', () => {
  it('a strong straight flick at the other pen can push it off; a still world stays still', () => {
    const still = simulate(START, 0, { t: 0, dir: 0, power: 0 }, 60);
    expect(still.out).toEqual([false, false]);
    const me = START[0], op = START[1];
    const dir = Math.atan2(op.y - me.y, op.x - me.x);
    const anyOut = candidates(START, 0).some((f) => simulate(START, 0, { ...f, dir, power: 1 }).out[1]);
    expect(anyOut).toBe(true);
  });
  it('a flick off-centre spins the pen', () => {
    const w = new PenWorld(START);
    w.flick(0, { t: 0.4, dir: Math.PI / 2, power: 0.6 });
    w.step();
    expect(Math.abs(w.pens[0].angularVelocity)).toBeGreaterThan(0.01);
  });
  it('a pen that leaves the bench is out', () => {
    expect(inBench(BENCH.x - 1, BENCH.y + 10)).toBe(false);
    const w = new PenWorld([{ x: BENCH.x + 30, y: BENCH.y + 200, angle: 0 }, { x: BENCH.x + 700, y: BENCH.y + 200, angle: 0 }]);
    w.flick(0, { t: 0, dir: Math.PI, power: 1 });
    for (let i = 0; i < 300; i++) w.step();
    expect(w.out[0]).toBe(true);
  });
  it('the computer finishes planning and returns a valid flick', () => {
    const ai = new PenAI(1, 'hard', createRng(3));
    ai.start(START);
    let f = null;
    for (let i = 0; i < 50 && !f; i++) f = ai.work(10);
    expect(f).not.toBeNull();
    expect(f!.power).toBeGreaterThan(0);
  });
});

describe('Sack Race hops', () => {
  it('a hop just after landing is perfect; a tap in the air wobbles; wobble causes a fall', () => {
    const p = newHopper(0);
    expect(hop(p)).toBe('slow'); // standing start
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) landed = stepHopper(p, DT) === 'land';
    expect(landed).toBe(true);
    for (let i = 0; i < 15; i++) stepHopper(p, DT);
    expect(hop(p)).toBe('perfect');
    expect(hop(p)).toBe('air');
    expect(hop(p)).toBe('air');
    expect(hop(p)).toBe('air');
    expect(hop(p)).toBe('air');
    expect(p.falls).toBe(1);
  });
  it('the computer reaches 1400 units', () => {
    const p = newHopper(0);
    const ai = new HopAI('medium', createRng(1));
    let t = 0;
    for (; t < 40 && p.x < 1400; t += DT) { if (ai.update(p, DT)) hop(p); stepHopper(p, DT); }
    expect(p.x).toBeGreaterThanOrEqual(1400);
    expect(t).toBeLessThan(20);
  });
});

describe('Three-Legged Race steps', () => {
  it('alternating steps move the pair; the same foot twice is a stumble', () => {
    const p = newPair(0);
    expect(stepFoot(p, 'L', 1)).toBe('slow');
    expect(stepFoot(p, 'R', 1.3)).toBe('good');
    expect(stepFoot(p, 'R', 1.6)).toBe('same');
    expect(stepFoot(p, 'L', 1.62)).toBe('together');
    expect(p.stumbles).toBe(2);
  });
  it('the computer pair finishes the course', () => {
    const p = newPair(0);
    const ai = new PairAI('hard', createRng(2));
    let t = 0;
    for (; t < 60 && p.x < 1200; t += DT) { ai.update(p, t); stepPair(p, DT); }
    expect(p.x).toBeGreaterThanOrEqual(1200);
  });
});

describe('Spoon & Marble', () => {
  it('speeding up rolls the marble back, braking rolls it forward', () => {
    const r = newRunner(0);
    const rng = createRng(1);
    r.hold = true;
    for (let i = 0; i < 20; i++) stepRunner(r, DT, rng, 'pickup', 0);
    expect(r.m).toBeLessThan(0);
    for (let i = 0; i < 200; i++) stepRunner(r, DT, rng, 'pickup', 0);
    r.hold = false;
    for (let i = 0; i < 20; i++) stepRunner(r, DT, rng, 'pickup', 0);
    expect(r.mv).toBeGreaterThan(0);
  });
  it('the marble falls if it leaves the spoon, and the runner stops', () => {
    const r = newRunner(0);
    r.v = 200; r.m = 0.99; r.mv = 5;
    expect(stepRunner(r, DT, createRng(1), 'pickup', 0)).toBe('drop');
    expect(r.down).toBeCloseTo(SPOON.pickup, 3);
  });
  it('the computer runner finishes', () => {
    for (const d of ['easy', 'hard'] as const) {
      const r = newRunner(0);
      const ai = new SpoonAI(d);
      const rng = createRng(5);
      let t = 0;
      for (; t < 60 && r.x < 1300; t += DT) { ai.update(r); stepRunner(r, DT, rng, 'pickup', 0); }
      expect(r.x, d).toBeGreaterThanOrEqual(1300);
    }
  });
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

describe('Musical Chairs', () => {
  it('pressing SIT during the music is a foul; after the stop, one kid is left standing', () => {
    const m = new ChairsModel(400, 440, [
      { player: 0, name: 'P1', color: '#000' }, { player: -1, name: 'A', color: '#000' }, { player: -1, name: 'B', color: '#000' },
    ], 'medium', createRng(3));
    expect(m.chairs).toHaveLength(2);
    expect(m.sit(0)).toBe('foul');
    let out = null;
    for (let i = 0; i < 20 / DT && !out; i++) {
      const ev = m.update(DT);
      if (ev.some((e) => e.type === 'stop')) m.sit(0);
      out = ev.find((e) => e.type === 'out')?.kid ?? null;
    }
    expect(out).not.toBeNull();
    expect(m.chairs.every((c) => c.taken !== null)).toBe(true);
  });
});

describe('Haari Bhanga', () => {
  it('places the pot far from the start and judges a swing', () => {
    const pot = placePot(createRng(1), 120, 350);
    expect(Math.hypot(pot.x - 120, pot.y - 350)).toBeGreaterThan(380);
    const b = newBlind(pot.x - HB.reach, pot.y, 0);
    expect(swing(b, pot)).toBe('hit');
    const b2 = newBlind(pot.x - HB.reach, pot.y, Math.PI);
    expect(swing(b2, pot)).toBe('miss');
  });
  it('friends shout the right direction when nobody lies', () => {
    const pot = { x: 500, y: 300 };
    const b = newBlind(300, 300, -Math.PI / 2); // facing up; the pot is to the right
    expect(relAngle(b, pot)).toBeGreaterThan(0);
    expect(friendShout(b, pot, createRng(1), 0)).toBe('right');
  });
  it('the computer usually finds and breaks the pot', () => {
    let broke = 0;
    for (let s = 0; s < 8; s++) {
      const rng = createRng(40 + s);
      const pot = placePot(rng, 120, 350);
      const b = newBlind(120, 350, rng.range(-3, 3));
      const ai = new BlindAI(rng, 0.3);
      for (let i = 0; i < HB.time / DT && !b.done; i++) { if (ai.update(b, pot, DT)) swing(b, pot); stepBlind(b, DT); }
      if (b.broke) broke++;
    }
    expect(broke).toBeGreaterThanOrEqual(6);
  });
});
