import Matter from 'matter-js';
import type { Rng } from '../../engine/rng';

// Rubber Band Shooting (side view) with Matter.js (MIT).
// The band is a light, fast body. Targets stand on desks. A target that falls
// off its desk scores. Level 3 adds a swinging paper bird and the ceiling fan.

export const ROOM = { w: 1100, h: 620, floor: 600 };
export const HAND = { x: 120, y: 420 };
export const STEP_MS = 1000 / 120;
export const MAX_PULL = 150;

export type TargetKind = 'cup' | 'chalk' | 'book' | 'box' | 'bird';
export const POINTS: Record<TargetKind, number> = { cup: 10, chalk: 15, book: 20, box: 30, bird: 50 };
const SIZE: Record<TargetKind, [number, number, number]> = { cup: [26, 34, 0.0004], chalk: [9, 42, 0.001], book: [64, 14, 0.0007], box: [52, 18, 0.0009], bird: [40, 22, 0.0006] };

export interface Desk { x: number; y: number; w: number }
export interface TargetDef { kind: TargetKind; x: number; y: number }
export interface Level { desks: Desk[]; targets: TargetDef[]; fan: boolean; bird?: { ax: number; ay: number; len: number } }

export const LEVELS: Level[] = [
  {
    desks: [{ x: 700, y: 470, w: 200 }],
    targets: [
      ...[0, 1, 2].map((i) => ({ kind: 'cup' as const, x: 810 + i * 30, y: 470 - 17 })),
      ...[0, 1].map((i) => ({ kind: 'cup' as const, x: 825 + i * 30, y: 470 - 51 })),
      { kind: 'cup', x: 840, y: 470 - 85 },
    ],
    fan: false,
  },
  {
    desks: [{ x: 560, y: 500, w: 160 }, { x: 860, y: 430, w: 190 }],
    targets: [
      ...[0, 1, 2, 3].map((i) => ({ kind: 'chalk' as const, x: 615 + i * 28, y: 500 - 21 })),
      { kind: 'book', x: 1010, y: 430 - 7 }, { kind: 'book', x: 1012, y: 430 - 21 }, { kind: 'box', x: 1018, y: 430 - 37 },
    ],
    fan: false,
  },
  {
    desks: [{ x: 820, y: 450, w: 220 }],
    targets: [
      ...[0, 1, 2].map((i) => ({ kind: 'cup' as const, x: 880 + i * 30, y: 450 - 17 })),
      ...[0, 1].map((i) => ({ kind: 'cup' as const, x: 895 + i * 30, y: 450 - 51 })),
      { kind: 'chalk', x: 1010, y: 450 - 21 },
    ],
    fan: true,
    bird: { ax: 600, ay: 60, len: 200 },
  },
];

export interface Target { kind: TargetKind; body: Matter.Body; desk: Desk | null; down: boolean }

export class BandWorld {
  engine = Matter.Engine.create();
  targets: Target[] = [];
  bands: Array<{ body: Matter.Body; age: number }> = [];
  fanOn: boolean;
  bird: Matter.Body | null = null;
  scored = 0;
  constructor(public level: Level) {
    this.fanOn = level.fan;
    const W = this.engine.world;
    const statics = [Matter.Bodies.rectangle(ROOM.w / 2, ROOM.floor + 30, ROOM.w * 3, 60, { isStatic: true, friction: 0.8 })];
    for (const d of level.desks) statics.push(Matter.Bodies.rectangle(d.x + d.w / 2, d.y + 10, d.w, 20, { isStatic: true, friction: 0.6 }));
    Matter.Composite.add(W, statics);
    for (const t of level.targets) {
      const [w, h, density] = SIZE[t.kind];
      const body = Matter.Bodies.rectangle(t.x, t.y, w, h, { density, friction: 0.5, restitution: 0.1, chamfer: { radius: t.kind === 'cup' ? 3 : 1 } });
      const desk = level.desks.find((d) => t.x >= d.x && t.x <= d.x + d.w) ?? null;
      this.targets.push({ kind: t.kind, body, desk, down: false });
      Matter.Composite.add(W, body);
    }
    if (level.bird) {
      const { ax, ay, len } = level.bird;
      const [w, h, density] = SIZE.bird;
      const body = Matter.Bodies.rectangle(ax, ay + len, w, h, { density, frictionAir: 0.01 });
      const c = Matter.Constraint.create({ pointA: { x: ax, y: ay }, bodyB: body, length: len, stiffness: 0.9 });
      Matter.Body.setVelocity(body, { x: 3, y: 0 });
      Matter.Composite.add(W, [body, c]);
      this.bird = body;
      this.targets.push({ kind: 'bird', body, desk: null, down: false });
    }
  }

  shoot(pullX: number, pullY: number) {
    const len = Math.min(MAX_PULL, Math.hypot(pullX, pullY));
    if (len < 12) return false;
    const speed = 6 + (len / MAX_PULL) * 14;
    const a = Math.atan2(-pullY, -pullX);
    const body = Matter.Bodies.rectangle(HAND.x + 20, HAND.y - 20, 24, 6, { density: 0.006, frictionAir: 0.006, restitution: 0.3, friction: 0.2 });
    Matter.Body.setAngle(body, a);
    Matter.Body.setVelocity(body, { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
    Matter.Body.setAngularVelocity(body, 0.25);
    Matter.Composite.add(this.engine.world, body);
    this.bands.push({ body, age: 0 });
    return true;
  }

  /** Step the world. Returns targets knocked down in this step. */
  step(): Target[] {
    if (this.fanOn) {
      for (const b of this.bands) {
        const p = b.body.position;
        if (p.x > 380 && p.x < 760 && p.y < 360) Matter.Body.applyForce(b.body, p, { x: 0, y: 0.000035 * b.body.mass * 60 });
      }
    }
    Matter.Engine.update(this.engine, STEP_MS);
    for (const b of this.bands) b.age += STEP_MS / 1000;
    const old = this.bands.filter((b) => b.age > 3 || b.body.position.x > ROOM.w + 100 || b.body.position.y > ROOM.floor + 50);
    for (const b of old) Matter.Composite.remove(this.engine.world, b.body);
    this.bands = this.bands.filter((b) => !old.includes(b));
    const fell: Target[] = [];
    for (const t of this.targets) {
      if (t.down) continue;
      const p = t.body.position;
      const offDesk = t.desk ? p.y > t.desk.y + 30 || p.x < t.desk.x - 25 || p.x > t.desk.x + t.desk.w + 25 : false;
      const birdHit = t.kind === 'bird' && t.body.speed > 9;
      // A cup or a chalk stick that is knocked over also counts.
      const tipped = (t.kind === 'cup' || t.kind === 'chalk') && Math.abs(Math.sin(t.body.angle)) > 0.85 && t.body.speed < 0.5;
      if (offDesk || birdHit || tipped) { t.down = true; this.scored += POINTS[t.kind]; fell.push(t); }
    }
    return fell;
  }

  get busy(): boolean {
    return this.bands.length > 0 || this.targets.some((t) => !t.down && t.kind !== 'bird' && t.body.speed > 0.3);
  }

  get cleared(): boolean {
    return this.targets.every((t) => t.down);
  }
}

/** Band path preview without collisions (same physics constants). */
export function previewPath(pullX: number, pullY: number, steps = 70, fan = false, every = 5): Array<[number, number]> {
  const w = new BandWorld({ desks: [], targets: [], fan });
  w.shoot(pullX, pullY);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps && w.bands.length; i++) {
    w.step();
    if (i % every === 0 && w.bands[0]) pts.push([w.bands[0].body.position.x, w.bands[0].body.position.y]);
  }
  return pts;
}

/** Computer aim: search pulls whose path passes nearest to a target. */
export function aiPull(w: BandWorld, rng: Rng, diff: 'easy' | 'medium' | 'hard'): [number, number] {
  const live = w.targets.filter((t) => !t.down);
  const tgt = live.sort((a, b) => POINTS[b.kind] - POINTS[a.kind] + (a.body.position.y - b.body.position.y) * 0.02)[0];
  const tx = tgt ? tgt.body.position.x : 800, ty = tgt ? tgt.body.position.y : 450;
  let best: [number, number] = [-100, 60];
  let bd = Infinity;
  for (let ang = 0.05; ang < 1.0; ang += 0.08) for (let len = 45; len <= MAX_PULL; len += 15) {
    const px = -Math.cos(ang) * len, py = Math.sin(ang) * len;
    const pts = previewPath(px, py, 160, w.fanOn, 1);
    for (const [x, y] of pts) { const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = [px, py]; } }
  }
  const noise = diff === 'easy' ? 14 : diff === 'medium' ? 8 : 3.5;
  return [best[0] + rng.gauss() * noise, best[1] + rng.gauss() * noise];
}
