import type { Rng } from '../../engine/rng';

// Paper Boat model (top view, y down; the race goes UP the screen, from y = LEN to y = 0).
// A cheap flow field: the current is fastest in the middle of a meandering channel.
// Boats steer sideways. Bumps and whirlpools soak the paper. 100 % soaked = sunk.

export const RIVER = { len: 4200, w: 640, boatR: 19 };

export function banks(y: number): [number, number] {
  return [90 + 28 * Math.sin(y * 0.0028), 550 + 28 * Math.sin(y * 0.0031 + 1.2)];
}

export function current(x: number, y: number): { vx: number; vy: number } {
  const [l, r] = banks(y);
  const mid = (l + r) / 2, half = (r - l) / 2;
  const prof = Math.max(0, 1 - ((x - mid) / half) ** 2);
  const vy = -(55 + 85 * prof);
  // Follow the channel direction: d(mid)/dy.
  const [l2, r2] = banks(y - 10);
  const dmid = ((l2 + r2) / 2 - mid) / 10;
  return { vx: -vy * dmid, vy };
}

export type ObKind = 'brick' | 'leaf' | 'sandal' | 'whirl';
export interface Obstacle { kind: ObKind; x: number; y: number; r: number; vx: number; vy: number }

export function makeObstacles(rng: Rng): Obstacle[] {
  const list: Obstacle[] = [];
  for (let y = RIVER.len - 500; y > 250; y -= rng.range(110, 190)) {
    const [l, r] = banks(y);
    const roll = rng.next();
    const kind: ObKind = roll < 0.4 ? 'brick' : roll < 0.62 ? 'leaf' : roll < 0.8 ? 'sandal' : 'whirl';
    const rad = kind === 'whirl' ? 46 : kind === 'brick' ? rng.range(18, 26) : 16;
    // Most obstacles sit near the fast middle, so the best line needs steering.
    const mid = (l + r) / 2, half = (r - l) / 2;
    const x = Math.min(r - rad - 10, Math.max(l + rad + 10, mid + rng.gauss() * half * 0.35));
    list.push({ kind, x, y, r: rad, vx: 0, vy: 0 });
  }
  return list;
}

export interface Boat { x: number; y: number; vx: number; vy: number; heading: number; steer: -1 | 0 | 1; soak: number; sunk: boolean; finished: boolean; bumps: number; cool: number }

export function newBoat(x: number): Boat {
  return { x, y: RIVER.len - 120, vx: 0, vy: -40, heading: -Math.PI / 2, steer: 0, soak: 0, sunk: false, finished: false, bumps: 0, cool: 0 };
}

export type BoatEvent = 'bump' | 'whirl' | 'bank' | 'sink' | 'finish' | null;

export function stepBoat(b: Boat, obs: Obstacle[], dt: number): BoatEvent {
  if (b.sunk || b.finished) return null;
  let ev: BoatEvent = null;
  b.cool = Math.max(0, b.cool - dt);
  const c = current(b.x, b.y);
  // Steering pushes sideways, relative to the flow.
  const side = b.steer * 120;
  b.vx += ((c.vx + side) - b.vx) * 1.8 * dt;
  b.vy += (c.vy - b.vy) * 1.4 * dt;
  b.heading += (Math.atan2(b.vy, b.vx) - b.heading) * Math.min(1, 3 * dt) + b.steer * 0.6 * dt;
  b.soak += 0.008 * dt; // rain keeps falling
  for (const o of obs) {
    const dx = b.x - o.x, dy = b.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (o.kind === 'whirl') {
      if (d < o.r) {
        b.vx -= (dx / d) * 220 * dt;
        b.vy -= (dy / d) * 220 * dt;
        b.vx += (-dy / d) * 160 * dt;
        b.vy += (dx / d) * 160 * dt;
        b.heading += 5 * dt;
        b.soak += 0.16 * dt;
        b.vy *= Math.exp(-1.5 * dt);
        ev = ev ?? 'whirl';
      }
      continue;
    }
    const minD = o.r + RIVER.boatR;
    if (d < minD) {
      b.x = o.x + (dx / d) * minD;
      b.y = o.y + (dy / d) * minD;
      const vn = b.vx * (dx / d) + b.vy * (dy / d);
      if (vn < 0) { b.vx -= 1.5 * vn * (dx / d); b.vy -= 1.5 * vn * (dy / d); }
      // The flow slides the boat round the obstacle instead of pinning it.
      b.vx += (dx >= 0 ? 1 : -1) * 90 * dt * 10;
      if (b.cool <= 0) { b.soak += o.kind === 'brick' ? 0.085 : 0.045; b.bumps++; b.cool = 0.4; b.vy *= 0.3; ev = 'bump'; }
    }
  }
  const [l, r] = banks(b.y);
  if (b.x < l + RIVER.boatR || b.x > r - RIVER.boatR) {
    b.x = Math.min(r - RIVER.boatR, Math.max(l + RIVER.boatR, b.x));
    b.vx *= -0.4;
    if (b.cool <= 0) { b.soak += 0.03; b.bumps++; b.cool = 0.5; ev = 'bank'; }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.soak >= 1) { b.soak = 1; b.sunk = true; return 'sink'; }
  if (b.y <= 0) { b.finished = true; return 'finish'; }
  return ev;
}

/** Move the floating obstacles with the current (leaves and sandals). */
export function stepObstacles(obs: Obstacle[], dt: number) {
  for (const o of obs) {
    if (o.kind !== 'leaf' && o.kind !== 'sandal') continue;
    const c = current(o.x, o.y);
    o.vx += (c.vx * 0.6 - o.vx) * dt;
    o.vy += (c.vy * 0.35 - o.vy) * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    const [l, r] = banks(o.y);
    o.x = Math.min(r - o.r, Math.max(l + o.r, o.x));
  }
}

/** Computer steering: score candidate lanes ahead (obstacles, the fast middle, small moves) and steer to the best. */
export class BoatAI {
  constructor(private rng: Rng, private skill: number) {}
  update(b: Boat, obs: Obstacle[]) {
    const [l, r] = banks(b.y - 80);
    const lo = l + RIVER.boatR + 8, hi = r - RIVER.boatR - 8;
    let best = b.x;
    let bc = Infinity;
    for (let k = 0; k <= 10; k++) {
      const x = lo + ((hi - lo) * k) / 10;
      let cost = Math.abs(x - (l + r) / 2) * 0.35 + Math.abs(x - b.x) * 0.12;
      for (const o of obs) {
        const dy = b.y - o.y;
        if (dy < -20 || dy > 260) continue;
        const need = o.r + RIVER.boatR + (o.kind === 'whirl' ? 26 : 12);
        const dx = Math.abs(o.x - x);
        if (dx < need) cost += (need - dx) * (o.kind === 'whirl' ? 6 : 4) * (1 - Math.max(0, dy) / 300);
      }
      if (cost < bc) { bc = cost; best = x; }
    }
    const err = best - b.x;
    b.steer = err > 10 ? 1 : err < -10 ? -1 : 0;
    if (!this.rng.chance(this.skill)) b.steer = 0;
  }
}
