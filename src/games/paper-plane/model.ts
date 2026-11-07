import type { Rng } from '../../engine/rng';

// Paper airplane glider model (side view, y down).
// Lift and drag depend on airspeed² and the angle of attack α = pitch − path angle.
// Above the stall angle the lift drops and the nose falls. Pitch is stable:
// it returns toward the path angle plus a trim, and the player can raise the nose.

export const WORLD = { len: 4600, ground: 700, g: 260, startX: 210, startY: 392 };

export interface PlaneType { kL: number; cd0: number; k: number; trim: number; cla: number; stall: number }
export type Fold = 'glider' | 'dart' | 'hawk';
export const TYPES: Record<Fold, PlaneType> = {
  glider: { kL: 0.0052, cd0: 0.06, k: 0.08, trim: 0.12, cla: 5, stall: 0.28 },
  dart: { kL: 0.0042, cd0: 0.032, k: 0.1, trim: 0.08, cla: 5, stall: 0.24 },
  /** Wide, floaty wings: slow and steady, easy to land where you want. */
  hawk: { kL: 0.0058, cd0: 0.078, k: 0.07, trim: 0.14, cla: 5, stall: 0.32 },
};

/** Distance: fly as far as you can. Accuracy: land on the marked roof. Obstacles: a crowded sky. */
export type Challenge = 'distance' | 'accuracy' | 'obstacle';

export interface Plane { x: number; y: number; vx: number; vy: number; pitch: number; up: boolean; stalled: boolean; alive: boolean; landed: boolean; rings: number; t: number }

export interface Building { x: number; w: number; top: number; tank?: number; color: string }
export interface Wire { x1: number; y1: number; x2: number; y2: number }
export interface Ring { x: number; y: number; taken: boolean }
export interface Thermal { x: number; w: number; lift: number }
export interface Kite { x: number; y: number; phase: number; color: string }

export interface Target { x1: number; x2: number; top: number; cx: number }
export interface Course { buildings: Building[]; wires: Wire[]; rings: Ring[]; thermals: Thermal[]; kites: Kite[]; target?: Target }

const FACADES = ['#f2c6a0', '#e8d7a6', '#c9dfc1', '#f0b8b8', '#bcd3e8', '#e6c9e8', '#f3e1b5'];

export function makeCourse(rng: Rng, challenge: Challenge = 'distance'): Course {
  const c = baseCourse(rng);
  if (challenge === 'accuracy') {
    // One roof, a few houses away, carries a chalk target. Fewer distractions.
    const cand = c.buildings.filter((b) => b.x > 900 && b.x < 2300 && b.w > 170);
    const b = cand.length ? rng.pick(cand) : c.buildings[4];
    b.tank = undefined;
    c.target = { x1: b.x, x2: b.x + b.w, top: b.top, cx: b.x + b.w / 2 };
    c.wires = c.wires.filter((w) => w.x2 < b.x - 40 || w.x1 > b.x + b.w + 40);
    c.kites = c.kites.slice(0, 1);
  }
  if (challenge === 'obstacle') {
    // A busy sky: wires between most houses, more kites and more rings.
    for (let i = 1; i < c.buildings.length - 1; i += 2) {
      const a = c.buildings[i], b = c.buildings[i + 1];
      if (!c.wires.some((w) => w.x1 === a.x + a.w)) c.wires.push({ x1: a.x + a.w, y1: a.top - 40 - rng.range(0, 60), x2: b.x, y2: b.top - 40 - rng.range(0, 60) });
    }
    for (let i = 0; i < 4; i++) c.kites.push({ x: 900 + i * 900 + rng.range(-150, 150), y: rng.range(200, 330), phase: rng.range(0, 6), color: rng.pick(['#e3127d', '#ffc20e', '#009e96', '#e0333f']) });
    for (let rx = 950; rx < WORLD.len - 300; rx += rng.range(500, 800)) c.rings.push({ x: rx, y: rng.range(250, 420), taken: false });
  }
  return c;
}

function baseCourse(rng: Rng): Course {
  const buildings: Building[] = [{ x: 0, w: 260, top: 420, tank: 60, color: '#e8d7a6' }];
  let x = 420;
  while (x < WORLD.len - 200) {
    const w = rng.range(150, 260);
    buildings.push({ x, w, top: rng.range(480, 610), tank: rng.chance(0.6) ? rng.range(20, w - 60) : undefined, color: rng.pick(FACADES) });
    x += w + rng.range(40, 140);
  }
  const wires: Wire[] = [];
  for (let i = 2; i < buildings.length - 1; i += 3) {
    const a = buildings[i], b = buildings[i + 1];
    if (!b) break;
    wires.push({ x1: a.x + a.w, y1: a.top - 20, x2: b.x, y2: b.top - 24 });
  }
  const rings: Ring[] = [];
  for (let rx = 700; rx < WORLD.len - 300; rx += rng.range(450, 700)) rings.push({ x: rx, y: rng.range(300, 450), taken: false });
  const thermals: Thermal[] = buildings.filter((_, i) => i % 3 === 2).map((b) => ({ x: b.x + b.w / 2, w: 110, lift: rng.range(110, 170) }));
  const kites: Kite[] = Array.from({ length: 4 }, (_, i) => ({ x: 1200 + i * 1000 + rng.range(-200, 200), y: rng.range(120, 260), phase: rng.range(0, 6), color: rng.pick(['#e3127d', '#ffc20e', '#009e96', '#e0333f']) }));
  return { buildings, wires, rings, thermals, kites };
}

export function wind(base: number, x: number, y: number, t: number, c: Course): { wx: number; wy: number } {
  let wy = 0;
  for (const th of c.thermals) {
    const d = Math.abs(x - th.x);
    if (d < th.w && y > 150) wy -= th.lift * (1 - d / th.w);
  }
  return { wx: base + Math.sin(t * 0.7 + x * 0.002) * 18, wy };
}

export function launch(angle: number, power: number): Plane {
  const s = 150 + power * 280;
  return { x: WORLD.startX, y: WORLD.startY, vx: Math.cos(angle) * s, vy: -Math.sin(angle) * s, pitch: angle, up: false, stalled: false, alive: true, landed: false, rings: 0, t: 0 };
}

export type HitKind = 'ground' | 'roof' | 'land' | 'wall' | 'wire' | 'kite' | 'tank' | 'finish' | null;

export function stepPlane(p: Plane, type: PlaneType, baseWind: number, c: Course, dt: number): { hit: HitKind; ring: boolean } {
  if (!p.alive) return { hit: null, ring: false };
  p.t += dt;
  const w = wind(baseWind, p.x, p.y, p.t, c);
  const ax = p.vx - w.wx, ay = p.vy - w.wy;
  const V = Math.max(1, Math.hypot(ax, ay));
  const gamma = Math.atan2(-ay, ax);
  const alpha = p.pitch - gamma;
  p.stalled = Math.abs(alpha) > type.stall;
  const cl = p.stalled ? Math.sign(alpha) * type.cla * type.stall * 0.5 : type.cla * alpha;
  const L = type.kL * V * V * cl;
  const D = type.kL * V * V * (type.cd0 + type.k * cl * cl);
  const px = ay / V, py = -ax / V; // perpendicular to the velocity, toward "up"
  p.vx += (L * px - D * (ax / V)) * dt;
  p.vy += (L * py - D * (ay / V) + WORLD.g) * dt;
  // Pitch: stable toward the path angle + trim; the player raises the nose.
  const target = gamma + type.trim + (p.up ? 0.42 : 0) - (p.stalled ? 0.5 : 0);
  p.pitch += (target - p.pitch) * Math.min(1, 3.2 * dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  let ring = false;
  for (const r of c.rings) if (!r.taken && Math.hypot(p.x - r.x, p.y - r.y) < 38) { r.taken = true; p.rings++; ring = true; }
  const hit = collide(p, c);
  if (hit) { p.alive = false; if (hit === 'land' || hit === 'finish') p.landed = true; }
  return { hit, ring };
}

function collide(p: Plane, c: Course): HitKind {
  if (p.x >= WORLD.len) return 'finish';
  if (p.y >= WORLD.ground) return 'ground';
  for (const b of c.buildings) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.top) {
      if (b.x === 0) continue; // the launch roof
      const soft = Math.hypot(p.vx, p.vy) < 230 && p.vy > -10 && p.vy < 120;
      return p.y - b.top < 16 ? (soft ? 'land' : 'roof') : 'wall';
    }
    if (b.tank !== undefined) {
      const tx = b.x + b.tank;
      if (p.x >= tx && p.x <= tx + 44 && p.y >= b.top - 46 && p.y <= b.top) return 'tank';
    }
  }
  for (const w of c.wires) {
    if (p.x < w.x1 || p.x > w.x2) continue;
    const t = (p.x - w.x1) / (w.x2 - w.x1);
    const sag = Math.sin(t * Math.PI) * 18;
    if (Math.abs(p.y - (w.y1 + (w.y2 - w.y1) * t + sag)) < 5) return 'wire';
  }
  for (const k of c.kites) if (Math.hypot(p.x - k.x, p.y - k.y) < 22) return 'kite';
  return null;
}

export function throwScore(p: Plane, challenge: Challenge = 'distance', c?: Course): number {
  if (challenge === 'accuracy' && c?.target) {
    const t = c.target;
    const onTarget = p.landed && p.x >= t.x1 && p.x <= t.x2;
    if (onTarget) return Math.max(150, Math.round(400 - Math.abs(p.x - t.cx) * 2.2)) + p.rings * 25;
    // Near misses still count a little.
    const d = Math.abs(p.x - t.cx);
    return Math.max(0, Math.round(120 - d / 6)) + (p.landed ? 30 : 0) + p.rings * 25;
  }
  const base = Math.round((Math.min(p.x, WORLD.len) - WORLD.startX) / 10) + p.rings * 50 + (p.landed ? 100 : 0);
  return challenge === 'obstacle' && p.x >= WORLD.len ? base + 200 : base;
}

/** Bullseye rings on the target roof, for drawing: radius in px from the centre. */
export const TARGET_RINGS = [18, 50, 90];

/** Computer pilot: keeps a good angle of attack, climbs for rings, avoids roofs ahead. */
export class PlaneAI {
  constructor(private rng: Rng, private skill: number) {}
  launchParams(): { angle: number; power: number } {
    return { angle: 0.25 + this.rng.gauss() * 0.1 * (1.2 - this.skill), power: Math.min(1, 0.75 + this.rng.gauss() * 0.12 * (1.2 - this.skill)) };
  }
  control(p: Plane, c: Course) {
    const ahead = c.buildings.find((b) => b.x > p.x && b.x < p.x + 320);
    const ring = c.rings.find((r) => !r.taken && r.x > p.x && r.x < p.x + 350);
    let wantUp = false;
    if (ahead && p.y > ahead.top - 40) wantUp = true;
    if (ring && p.y > ring.y + 10) wantUp = true;
    if (c.target) {
      // Accuracy: glide down onto the marked roof.
      const t = c.target;
      if (p.x > t.x1 - 260 && p.x < t.cx) wantUp = p.y > t.top - 20;
      else if (p.x >= t.cx - 30) wantUp = true; // flare to land softly
    }
    if (Math.hypot(p.vx, p.vy) < 170) wantUp = false; // do not stall
    p.up = this.rng.chance(this.skill) ? wantUp : this.rng.chance(0.5);
  }
}
