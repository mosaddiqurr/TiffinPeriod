import type { Rng } from '../../engine/rng';

// Eraser Flip physics, seen from above. An eraser is a box (64 × 36) that flies (z), flips
// over its long side while in the air, then slides with rubber friction. Pure and deterministic.

export const DESK = { left: 30, top: 30, right: 570, bottom: 790 };
export const EW = 64, EH = 36;
const G = 1500;
const MU = 1150;

export interface Eraser {
  id: number;
  x: number; y: number; a: number;
  vx: number; vy: number; w: number;
  z: number; vz: number;
  flip: number; flipRate: number;
  air: boolean;
  fallen: boolean;
  stand: boolean;
  onTop: number | null;
  color: [string, string];
  static?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number; height: number; kind: 'pencilbox' | 'ruler' | 'pencil' | 'sharpener' }

export interface World { erasers: Eraser[]; boxes: Box[]; t: number; events: string[] }

export function newEraser(id: number, x: number, y: number, a: number, color: [string, string], isStatic = false): Eraser {
  return { id, x, y, a, vx: 0, vy: 0, w: 0, z: 0, vz: 0, flip: 0, flipRate: 0, air: false, fallen: false, stand: false, onTop: null, color, static: isStatic };
}

export const cloneWorld = (w: World): World => ({ erasers: w.erasers.map((e) => ({ ...e })), boxes: w.boxes, t: w.t, events: [] });

export function flick(e: Eraser, angle: number, power: number, spin = 0) {
  const p = Math.max(0, Math.min(1, power));
  const v = 160 + p * 760;
  e.vx = Math.cos(angle) * v; e.vy = Math.sin(angle) * v;
  e.vz = 140 + p * 220;
  e.flipRate = (4 + p * 13) * (p > 0.5 ? 1 : 0.8);
  e.w = spin * 7;
  e.air = true; e.stand = false; e.onTop = null;
}

/** Points of an eraser's footprint, for overlap tests. */
export function corners(e: Pick<Eraser, 'x' | 'y' | 'a'>, w = EW, h = EH): Array<[number, number]> {
  const c = Math.cos(e.a), s = Math.sin(e.a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => [e.x + px * c - py * s, e.y + px * s + py * c]);
}

export function inside(e: Pick<Eraser, 'x' | 'y' | 'a'>, px: number, py: number, w = EW, h = EH): boolean {
  const c = Math.cos(-e.a), s = Math.sin(-e.a);
  const dx = px - e.x, dy = py - e.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

/** Share of `a`'s footprint that lies on `b`. */
export function overlap(a: Eraser, b: Eraser): number {
  let n = 0, hit = 0;
  const c = Math.cos(a.a), s = Math.sin(a.a);
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const lx = (i / 2) * (EW / 2) * 0.9, ly = j * (EH / 2) * 0.8;
    n++;
    if (inside(b, a.x + lx * c - ly * s, a.y + lx * s + ly * c)) hit++;
  }
  return hit / n;
}

const offDesk = (e: Eraser) => e.x < DESK.left || e.x > DESK.right || e.y < DESK.top || e.y > DESK.bottom;

function circles(e: Eraser): Array<[number, number]> {
  const c = Math.cos(e.a), s = Math.sin(e.a);
  return [-16, 0, 16].map((o) => [e.x + c * o, e.y + s * o]);
}

export function step(w: World, dt = 1 / 120) {
  w.t += dt;
  for (const e of w.erasers) {
    if (e.fallen || e.static || e.onTop !== null) continue;
    if (e.air) {
      e.x += e.vx * dt; e.y += e.vy * dt; e.a += e.w * dt;
      e.vz -= G * dt; e.z += e.vz * dt;
      e.flip += e.flipRate * dt;
      if (e.z <= 0) {
        e.z = 0;
        // Landed: on top of another eraser?
        const other = w.erasers.find((o) => o !== e && !o.fallen && overlap(e, o) >= 0.42);
        if (other) {
          e.onTop = other.id; e.air = false; e.vx = e.vy = e.w = 0; e.z = 8;
          w.events.push(`top:${e.id}:${other.id}`);
          continue;
        }
        const face = Math.cos(e.flip);
        if (Math.abs(face) < 0.08 && Math.abs(e.vz) < 520) {
          e.stand = true; e.air = false; e.vx = e.vy = e.w = 0; w.events.push(`stand:${e.id}`);
          continue;
        }
        if (Math.abs(e.vz) > 380) { e.vz = -e.vz * 0.22; e.flipRate *= 0.4; w.events.push('bounce'); }
        else { e.air = false; e.vz = 0; e.flip = face >= 0 ? 0 : Math.PI; e.flipRate = 0; w.events.push(`land:${e.id}`); }
      }
    } else if (e.vx || e.vy || e.w) {
      const sp = Math.hypot(e.vx, e.vy);
      const ns = Math.max(0, sp - MU * dt);
      if (ns < 4) { e.vx = 0; e.vy = 0; } else { e.vx *= ns / sp; e.vy *= ns / sp; }
      e.w *= Math.exp(-6 * dt);
      if (Math.abs(e.w) < 0.05) e.w = 0;
      e.x += e.vx * dt; e.y += e.vy * dt; e.a += e.w * dt;
    }
    if (!e.air && !e.fallen && offDesk(e)) { e.fallen = true; e.vx = e.vy = 0; w.events.push(`fall:${e.id}`); }
  }
  // Sliding collisions with boxes and other erasers (only near the desk surface).
  for (const e of w.erasers) {
    if (e.fallen || e.static || e.onTop !== null) continue;
    for (const b of w.boxes) {
      if (e.z > b.height) continue;
      for (const [cx, cy] of circles(e)) {
        const nx = Math.max(b.x, Math.min(b.x + b.w, cx)), ny = Math.max(b.y, Math.min(b.y + b.h, cy));
        const dx = cx - nx, dy = cy - ny, d = Math.hypot(dx, dy);
        if (d < 17 && d > 0) {
          const ux = dx / d, uy = dy / d;
          e.x += ux * (17 - d); e.y += uy * (17 - d);
          const vn = e.vx * ux + e.vy * uy;
          if (vn < 0) { e.vx -= 1.4 * vn * ux; e.vy -= 1.4 * vn * uy; if (e.air) { e.vz = Math.min(e.vz, 0); } w.events.push('knock'); }
        }
      }
    }
    for (const o of w.erasers) {
      if (o === e || o.fallen || o.onTop !== null || e.air || o.air) continue;
      for (const [ax, ay] of circles(e)) for (const [bx, by] of circles(o)) {
        const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy);
        if (d < 34 && d > 0) {
          const ux = dx / d, uy = dy / d, push = (34 - d) / 2;
          e.x += ux * push; e.y += uy * push;
          if (!o.static) { o.x -= ux * push; o.y -= uy * push; }
          const rv = (e.vx - o.vx) * ux + (e.vy - o.vy) * uy;
          if (rv < 0) {
            const k = o.static ? 1.5 : 0.85;
            e.vx -= k * rv * ux; e.vy -= k * rv * uy;
            if (!o.static) { o.vx += k * rv * ux; o.vy += k * rv * uy; o.w += (Math.random() - 0.5) * 0.0; }
            w.events.push('knock');
          }
        }
      }
    }
  }
}

export const busy = (w: World) => w.erasers.some((e) => !e.fallen && e.onTop === null && (e.air || e.vx !== 0 || e.vy !== 0));

export function settle(w: World, max = 6) {
  const t0 = w.t;
  do step(w); while (busy(w) && w.t - t0 < max);
}

/** Where the eraser first touches down (for the aim guide). */
export function landingPoint(e: Eraser, angle: number, power: number): { x: number; y: number; slide: { x: number; y: number } } {
  const c: Eraser = { ...e };
  flick(c, angle, power);
  let land: { x: number; y: number } | null = null;
  for (let i = 0; i < 1200 && (c.air || c.vx || c.vy); i++) {
    const was = c.air;
    const w: World = { erasers: [c], boxes: [], t: 0, events: [] };
    step(w);
    if (was && !c.air && !land) land = { x: c.x, y: c.y };
    if (c.stand) break;
  }
  return { x: land?.x ?? c.x, y: land?.y ?? c.y, slide: { x: c.x, y: c.y } };
}

// ---------- Computer ----------

export function aiFlick(w: World, me: number, target: number, skill: number, rng: Rng): { angle: number; power: number } {
  const e = w.erasers.find((x) => x.id === me)!;
  const o = w.erasers.find((x) => x.id === target)!;
  const base = Math.atan2(o.y - e.y, o.x - e.x);
  let best = { angle: base, power: 0.4, score: -Infinity };
  for (let da = -0.12; da <= 0.12; da += 0.04) {
    for (let p = 0.15; p <= 1.001; p += 0.05) {
      const sim = cloneWorld(w);
      const se = sim.erasers.find((x) => x.id === me)!;
      flick(se, base + da, p);
      settle(sim, 4);
      let s = 0;
      if (se.fallen) s = -1000;
      else if (se.onTop === target) s = 1000 - Math.abs(da) * 100;
      else {
        const so = sim.erasers.find((x) => x.id === target)!;
        if (so.fallen) s = 600;
        const d = Math.hypot(se.x - so.x, se.y - so.y);
        const edge = Math.min(se.x - DESK.left, DESK.right - se.x, se.y - DESK.top, DESK.bottom - se.y);
        s = s + 200 - Math.abs(d - 150) * 0.6 + Math.min(edge, 120) * 0.8;
      }
      if (s > best.score) best = { angle: base + da, power: p, score: s };
    }
  }
  const err = (1 - skill) * 0.2;
  return { angle: best.angle + rng.gauss() * err * 0.6, power: Math.max(0.1, Math.min(1, best.power + rng.gauss() * err)) };
}
