import Matter from 'matter-js';
import type { Rng } from '../../engine/rng';

// Pen Fight physics (top view) with Matter.js (MIT).
// Gravity is zero. Table friction is air friction on each pen.
// A flick is an impulse at the grab point: it moves the pen and spins it.
// A pen whose centre leaves the bench falls off.

export const BENCH = { x: 70, y: 80, w: 860, h: 470 };
export const PEN = { len: 150, wid: 16 };
export const STEP_MS = 1000 / 120;

export interface PenPose { x: number; y: number; angle: number }
export interface Flick { t: number; dir: number; power: number } // t = grab point along the pen (−0.5…0.5), dir = angle, power 0…1

export class PenWorld {
  engine: Matter.Engine;
  pens: Matter.Body[];
  out: boolean[] = [false, false];
  constructor(poses: PenPose[]) {
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, enableSleeping: false });
    this.pens = poses.map((p) => {
      const b = Matter.Bodies.rectangle(p.x, p.y, PEN.len, PEN.wid, { chamfer: { radius: 7 }, frictionAir: 0.03, friction: 0.08, restitution: 0.45, density: 0.002 });
      Matter.Body.setAngle(b, p.angle);
      return b;
    });
    Matter.Composite.add(this.engine.world, this.pens);
  }

  pose(i: number): PenPose {
    const b = this.pens[i];
    return { x: b.position.x, y: b.position.y, angle: b.angle };
  }

  /** Apply a flick to pen i. */
  flick(i: number, f: Flick) {
    const b = this.pens[i];
    const speed = 4 + f.power * 18; // units per base frame
    const vx = Math.cos(f.dir) * speed, vy = Math.sin(f.dir) * speed;
    const rx = Math.cos(b.angle) * f.t * PEN.len, ry = Math.sin(b.angle) * f.t * PEN.len;
    const w = ((rx * vy - ry * vx) * 12) / (PEN.len * PEN.len) * 0.35;
    Matter.Body.setVelocity(b, { x: b.velocity.x + vx, y: b.velocity.y + vy });
    Matter.Body.setAngularVelocity(b, b.angularVelocity + w);
  }

  step() {
    Matter.Engine.update(this.engine, STEP_MS);
    this.pens.forEach((b, i) => {
      if (this.out[i]) return;
      if (!inBench(b.position.x, b.position.y)) {
        this.out[i] = true;
        Matter.Composite.remove(this.engine.world, b);
      }
    });
  }

  settled(): boolean {
    return this.pens.every((b, i) => this.out[i] || (b.speed < 0.08 && Math.abs(b.angularVelocity) < 0.003));
  }

  /** Grab point (−0.5…0.5 along the pen) under a world point, or null. */
  grabAt(i: number, x: number, y: number): number | null {
    const b = this.pens[i];
    if (this.out[i]) return null;
    const dx = x - b.position.x, dy = y - b.position.y;
    const along = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
    const across = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
    if (Math.abs(along) > PEN.len / 2 + 14 || Math.abs(across) > PEN.wid / 2 + 22) return null;
    return Math.max(-0.5, Math.min(0.5, along / PEN.len));
  }
}

export function inBench(x: number, y: number): boolean {
  return x >= BENCH.x && x <= BENCH.x + BENCH.w && y >= BENCH.y && y <= BENCH.y + BENCH.h;
}

export function edgeDistance(p: PenPose): number {
  return Math.min(p.x - BENCH.x, BENCH.x + BENCH.w - p.x, p.y - BENCH.y, BENCH.y + BENCH.h - p.y);
}

/** Simulate a flick from settled poses. Returns who is out afterwards and the final poses. */
export function simulate(poses: PenPose[], who: number, f: Flick, maxSteps = 420) {
  const w = new PenWorld(poses);
  w.flick(who, f);
  for (let s = 0; s < maxSteps; s++) {
    w.step();
    if (s > 20 && w.settled()) break;
  }
  return { out: [...w.out], poses: [w.pose(0), w.pose(1)] };
}

export function scoreOutcome(who: number, r: ReturnType<typeof simulate>): number {
  const opp = 1 - who;
  let s = 0;
  if (r.out[opp]) s += 100;
  if (r.out[who]) s -= 160;
  if (!r.out[opp]) s -= edgeDistance(r.poses[opp]) * 0.25;
  if (!r.out[who]) s += Math.min(120, edgeDistance(r.poses[who])) * 0.15;
  return s;
}

/** Candidate flicks aimed at the other pen, with spread. */
export function candidates(poses: PenPose[], who: number): Flick[] {
  const me = poses[who], op = poses[1 - who];
  const base = Math.atan2(op.y - me.y, op.x - me.x);
  const list: Flick[] = [];
  for (const t of [-0.38, -0.18, 0, 0.18, 0.38]) for (const da of [-0.3, -0.15, 0, 0.15, 0.3]) for (const power of [0.45, 0.7, 0.95]) list.push({ t, dir: base + da, power });
  return list;
}

/** The computer plans over several frames so the game does not stutter. */
export class PenAI {
  private queue: Flick[] = [];
  private results: Array<{ f: Flick; s: number }> = [];
  private poses: PenPose[] = [];
  constructor(private who: number, private diff: 'easy' | 'medium' | 'hard', private rng: Rng) {}
  start(poses: PenPose[]) {
    this.poses = poses;
    this.queue = candidates(poses, this.who);
    this.results = [];
  }
  /** Work a little. Returns the chosen flick when planning is complete. */
  work(budget = 8): Flick | null {
    for (let i = 0; i < budget && this.queue.length; i++) {
      const f = this.queue.pop()!;
      this.results.push({ f, s: scoreOutcome(this.who, simulate(this.poses, this.who, f)) });
    }
    if (this.queue.length) return null;
    this.results.sort((a, b) => b.s - a.s);
    const pickFrom = this.diff === 'easy' ? Math.ceil(this.results.length * 0.5) : this.diff === 'medium' ? 4 : 1;
    const chosen = this.results[this.rng.int(0, Math.max(0, pickFrom - 1))].f;
    const noise = this.diff === 'easy' ? 0.12 : this.diff === 'medium' ? 0.06 : 0.02;
    return { t: chosen.t, dir: chosen.dir + this.rng.gauss() * noise, power: Math.max(0.2, Math.min(1, chosen.power + this.rng.gauss() * noise)) };
  }
}

export const START: PenPose[] = [
  { x: BENCH.x + BENCH.w * 0.3, y: BENCH.y + BENCH.h * 0.55, angle: -0.35 },
  { x: BENCH.x + BENCH.w * 0.7, y: BENCH.y + BENCH.h * 0.45, angle: Math.PI - 0.35 },
];
