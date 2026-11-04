import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { BandWorld, LEVELS, POINTS, aiPull, previewPath } from '../src/games/rubber-band/model';
import { TYPES, WORLD, launch, makeCourse, stepPlane, throwScore, PlaneAI } from '../src/games/paper-plane/model';
import { BoatAI, RIVER, banks, current, makeObstacles, newBoat, stepBoat, stepObstacles } from '../src/games/paper-boat/model';
import { DOODLES, PARTY_WORDS } from '../src/games/notebook-drawing/words';
import { ACHIEVEMENTS } from '../src/platform/scores';
import { GAMES } from '../src/platform/registry';

const DT = 1 / 120;

describe('Rubber Band Shooting', () => {
  it('a band flies in an arc and falls; the fan pushes it down', () => {
    const a = previewPath(-120, 50, 120, false);
    const b = previewPath(-120, 50, 120, true);
    expect(a[a.length - 1][0]).toBeGreaterThan(600);
    expect(b[b.length - 1][1]).toBeGreaterThan(a[a.length - 1][1] + 30);
  });
  it('the computer scores on every level within five bands', () => {
    for (const lv of LEVELS) {
      const w = new BandWorld(lv);
      const rng = createRng(4);
      for (let s = 0; s < 5 && !w.cleared; s++) { const p = aiPull(w, rng, 'hard'); w.shoot(p[0], p[1]); for (let i = 0; i < 400; i++) w.step(); }
      expect(w.scored).toBeGreaterThan(0);
    }
  });
  it('a weak pull does not shoot', () => {
    expect(new BandWorld(LEVELS[0]).shoot(-5, 3)).toBe(false);
  });
  it('points are defined for every target kind', () => {
    for (const lv of LEVELS) for (const t of lv.targets) expect(POINTS[t.kind]).toBeGreaterThan(0);
  });
});

describe('Paper Airplane', () => {
  it('a good throw glides much farther than a weak, flat throw', () => {
    const c = makeCourse(createRng(7));
    const fly = (a: number, p: number) => { const pl = launch(a, p); for (let i = 0; i < 60 / DT && pl.alive; i++) stepPlane(pl, TYPES.glider, 0, c, DT); return pl; };
    const good = fly(0.4, 1), weak = fly(0.05, 0.25);
    expect(good.x).toBeGreaterThan(weak.x + 300);
    expect(good.alive).toBe(false);
  });
  it('holding the nose up for too long stalls the plane', () => {
    const c = { buildings: [], wires: [], rings: [], thermals: [], kites: [] };
    const p = launch(0.2, 0.6);
    p.up = true;
    let stalled = false;
    for (let i = 0; i < 3 / DT && p.alive; i++) { stepPlane(p, TYPES.dart, 0, c, DT); stalled ||= p.stalled; }
    expect(stalled).toBe(true);
  });
  it('the score counts distance, rings and a soft landing', () => {
    const p = launch(0, 0);
    p.x = WORLD.startX + 1000; p.rings = 2; p.landed = true;
    expect(throwScore(p)).toBe(100 + 100 + 100);
  });
  it('the computer pilot flies a reasonable distance', () => {
    const c = makeCourse(createRng(2));
    const ai = new PlaneAI(createRng(3), 0.9);
    const lp = ai.launchParams();
    const p = launch(lp.angle, lp.power);
    for (let i = 0; i < 60 / DT && p.alive; i++) { ai.control(p, c); stepPlane(p, TYPES.glider, 10, c, DT); }
    expect(throwScore(p)).toBeGreaterThan(150);
  });
});

describe('Paper Boat', () => {
  it('the current flows up the stream and is fastest in the middle', () => {
    const y = 2000;
    const [l, r] = banks(y);
    const mid = current((l + r) / 2, y), edge = current(l + 10, y);
    expect(mid.vy).toBeLessThan(edge.vy);
    expect(mid.vy).toBeLessThan(0);
  });
  it('steering boats finish much more often than boats that do not steer', () => {
    let aiDone = 0, idleSunk = 0;
    for (let s = 1; s <= 8; s++) {
      const obs = makeObstacles(createRng(s)); const b = newBoat(320); const ai = new BoatAI(createRng(9), 0.95);
      for (let i = 0; i < 120 / DT && !b.finished && !b.sunk; i++) { stepObstacles(obs, DT); ai.update(b, obs); stepBoat(b, obs, DT); }
      if (b.finished) aiDone++;
      const obs2 = makeObstacles(createRng(s)); const idle = newBoat(320);
      for (let i = 0; i < 120 / DT && !idle.finished && !idle.sunk; i++) { stepObstacles(obs2, DT); stepBoat(idle, obs2, DT); }
      if (idle.sunk) idleSunk++;
    }
    expect(aiDone).toBeGreaterThanOrEqual(7);
    expect(idleSunk).toBeGreaterThanOrEqual(2);
  });
  it('a soaked boat sinks', () => {
    const b = newBoat(320);
    b.soak = 0.999;
    for (let i = 0; i < 300 && !b.sunk; i++) stepBoat(b, [], DT);
    expect(b.sunk).toBe(true);
    expect(RIVER.len).toBeGreaterThan(1000);
  });
});

describe('Notebook Drawing data', () => {
  it('has words in both languages and doodles with strokes', () => {
    expect(PARTY_WORDS.length).toBeGreaterThanOrEqual(20);
    for (const w of PARTY_WORDS) { expect(w.bn.length).toBeGreaterThan(0); expect(w.en.length).toBeGreaterThan(0); }
    expect(DOODLES.length).toBeGreaterThanOrEqual(12);
    for (const d of DOODLES) { expect(d.strokes.length).toBeGreaterThan(0); for (const s of d.strokes) expect(s).toMatch(/^M/); }
    expect(new Set(DOODLES.map((d) => d.word.en)).size).toBe(DOODLES.length);
  });
});

describe('Phase 2 achievements', () => {
  it('every playable Phase 2 game has at least one achievement', () => {
    for (const g of GAMES.filter((x) => x.phase === 2)) expect(ACHIEVEMENTS.some((a) => a.gameId === g.id), g.id).toBe(true);
  });
});
