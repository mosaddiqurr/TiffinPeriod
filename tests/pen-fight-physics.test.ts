import { describe, expect, it } from 'vitest';
import { PENS, PenWorld, candidates, simulate, startPoses, type PenId } from '../src/games/pen-fight/model';

// How Pen Fight should feel: a flick moves a pen a believable distance, and a knock-out
// has to be set up (get close, hit a pen near the edge). One big smash from the start never wins.

const alone = (id: PenId, power: number) => {
  const w = new PenWorld([PENS[id], PENS[id]], [{ x: -29, y: 0, a: Math.PI / 2 }, { x: 0, y: 30000, a: 0 }]);
  w.flick(0, { t: 0, dir: 0, power });
  w.settle(10);
  return { out: w.pens[0].out, dist: w.pens[0].x + 29 };
};

describe('Pen Fight physics', () => {
  it('a full flick slides a pen along the desk, not off the far side', () => {
    for (const id of ['classic', 'gel'] as PenId[]) {
      const r = alone(id, 1);
      expect(r.out).toBe(false);
      expect(r.dist).toBeLessThan(55);
      expect(r.dist).toBeGreaterThan(18);
    }
    // The light pen goes further than the heavy one.
    expect(alone('classic', 1).dist).toBeGreaterThan(alone('gel', 1).dist);
  });

  it('half power still moves the pen a useful amount', () => {
    expect(alone('classic', 0.5).dist).toBeGreaterThan(10);
    expect(alone('gel', 0.5).dist).toBeGreaterThan(5);
  });

  it('no shot from the starting places knocks the other pen off', () => {
    for (const [a, b] of [['classic', 'classic'], ['gel', 'gel'], ['classic', 'gel'], ['gel', 'classic']] as PenId[][]) {
      const w = new PenWorld([PENS[a], PENS[b]], startPoses());
      for (const f of candidates(w, 0)) expect(simulate(w, 0, f).out[1]).toBe(false);
    }
  });

  it('a strong hit on a pen near the edge knocks it off; a soft one does not', () => {
    const near = () => new PenWorld([PENS.classic, PENS.classic], [{ x: 14, y: 0, a: Math.PI / 2 }, { x: 23, y: 0, a: Math.PI / 2 + 0.2 }]);
    expect(simulate(near(), 0, { t: 0, dir: 0, power: 1 }).out[1]).toBe(true);
    expect(simulate(near(), 0, { t: 0, dir: 0, power: 0.5 }).out[1]).toBe(false);
  });
});
