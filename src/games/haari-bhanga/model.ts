import type { Rng } from '../../engine/rng';

// Haari Bhanga model (pure, top view, y down, heading 0 = +x).
// A blindfolded player turns, walks and swings a stick at a hidden pot.

export const HB = { turnRate: 1.9, walk: 115, reach: 58, hitR: 34, swings: 3, time: 60, fieldW: 1000, fieldH: 700 };

export interface Blind {
  x: number; y: number; heading: number;
  turn: -1 | 0 | 1; walking: boolean;
  swingsLeft: number; swingT: number;
  path: Array<[number, number]>;
  done: boolean; broke: boolean; time: number;
}

export function newBlind(x: number, y: number, heading: number): Blind {
  return { x, y, heading, turn: 0, walking: false, swingsLeft: HB.swings, swingT: 0, path: [[x, y]], done: false, broke: false, time: 0 };
}

export function placePot(rng: Rng, sx: number, sy: number): { x: number; y: number } {
  for (let i = 0; i < 100; i++) {
    const x = rng.range(160, HB.fieldW - 80), y = rng.range(90, HB.fieldH - 90);
    if (Math.hypot(x - sx, y - sy) > 380) return { x, y };
  }
  return { x: HB.fieldW - 150, y: HB.fieldH / 2 };
}

export function stepBlind(b: Blind, dt: number) {
  if (b.done) return;
  b.time += dt;
  b.swingT = Math.max(0, b.swingT - dt);
  b.heading += b.turn * HB.turnRate * dt;
  if (b.walking && b.swingT <= 0) {
    b.x = Math.min(HB.fieldW - 20, Math.max(20, b.x + Math.cos(b.heading) * HB.walk * dt));
    b.y = Math.min(HB.fieldH - 20, Math.max(20, b.y + Math.sin(b.heading) * HB.walk * dt));
    const last = b.path[b.path.length - 1];
    if (Math.hypot(last[0] - b.x, last[1] - b.y) > 12) b.path.push([b.x, b.y]);
  }
  if (b.time >= HB.time) b.done = true;
}

/** Angle from the player's heading to the pot, in (−π, π]. Negative = pot is to the left. */
export function relAngle(b: Blind, pot: { x: number; y: number }): number {
  let a = Math.atan2(pot.y - b.y, pot.x - b.x) - b.heading;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function swing(b: Blind, pot: { x: number; y: number }): 'hit' | 'miss' | 'none' {
  if (b.done || b.swingsLeft <= 0 || b.swingT > 0) return 'none';
  b.swingsLeft--;
  b.swingT = 0.45;
  const sx = b.x + Math.cos(b.heading) * HB.reach, sy = b.y + Math.sin(b.heading) * HB.reach;
  const hit = Math.hypot(sx - pot.x, sy - pot.y) <= HB.hitR;
  if (hit) { b.broke = true; b.done = true; }
  else if (b.swingsLeft <= 0) b.done = true;
  return hit ? 'hit' : 'miss';
}

export type Shout = 'left' | 'right' | 'straight' | 'hit' | 'back';

/** What a friend shouts. A naughty friend lies sometimes. */
export function friendShout(b: Blind, pot: { x: number; y: number }, rng: Rng, lieChance: number): Shout {
  const a = relAngle(b, pot);
  const d = Math.hypot(pot.x - b.x, pot.y - b.y);
  let s: Shout;
  if (Math.abs(a) > 2.2) s = 'back';
  else if (a < -0.3) s = 'left';
  else if (a > 0.3) s = 'right';
  else s = d < HB.reach + 25 ? 'hit' : 'straight';
  if (rng.chance(lieChance)) {
    const opts: Shout[] = ['left', 'right', 'straight'].filter((x) => x !== s) as Shout[];
    s = rng.pick(opts);
  }
  return s;
}

/** Computer player: follows its own noisy sense of the pot direction. */
export class BlindAI {
  private belief = 0;
  private think = 0;
  constructor(private rng: Rng, private noise: number) {}
  update(b: Blind, pot: { x: number; y: number }, dt: number): boolean {
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35;
      this.belief = relAngle(b, pot) + this.rng.gauss() * this.noise;
    }
    const d = Math.hypot(pot.x - b.x, pot.y - b.y);
    b.turn = this.belief < -0.15 ? -1 : this.belief > 0.15 ? 1 : 0;
    this.belief -= b.turn * HB.turnRate * dt;
    b.walking = Math.abs(this.belief) < 0.5 && d > HB.reach - 6;
    return Math.abs(this.belief) < 0.2 && d < HB.reach + 14 && b.swingT <= 0;
  }
}
