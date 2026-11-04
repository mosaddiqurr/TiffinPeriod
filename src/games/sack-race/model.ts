import type { Rng } from '../../engine/rng';

// Sack Race hop model (pure).
// Tap to hop. The best moment is shortly after landing. A tap too soon after
// landing, or a tap in the air, adds wobble. Too much wobble = a fall.

export const HOP = { g: 1900, vh: 530, vx: 185, perfectFrom: 0.06, perfectTo: 0.3, okTo: 0.7, fallTime: 1.3 };

export type HopJudge = 'perfect' | 'ok' | 'slow' | 'soon' | 'air' | 'down';

export interface Hopper {
  x: number; h: number; vh: number; vx: number;
  grounded: boolean;
  groundT: number;   // time on the ground since landing
  wobble: number;    // 0..1; 1 = fall
  fallen: number;    // seconds left lying down
  hops: number; falls: number; perfects: number;
}

export function newHopper(x: number): Hopper {
  return { x, h: 0, vh: 0, vx: 0, grounded: true, groundT: 1, wobble: 0, fallen: 0, hops: 0, falls: 0, perfects: 0 };
}

export function hop(p: Hopper): HopJudge {
  if (p.fallen > 0) return 'down';
  if (!p.grounded) {
    p.wobble += 0.3;
    checkFall(p);
    return 'air';
  }
  const gt = p.groundT;
  let q: number;
  let j: HopJudge;
  if (gt < HOP.perfectFrom) { q = 0.55; j = 'soon'; p.wobble += 0.38; }
  else if (gt <= HOP.perfectTo) { q = 1; j = 'perfect'; p.wobble = Math.max(0, p.wobble - 0.1); p.perfects++; }
  else if (gt <= HOP.okTo) { q = 0.85; j = 'ok'; }
  else { q = 0.7; j = 'slow'; }
  if (checkFall(p)) return j;
  p.vh = HOP.vh;
  p.vx = HOP.vx * q;
  p.grounded = false;
  p.hops++;
  return j;
}

function checkFall(p: Hopper): boolean {
  if (p.wobble >= 1) {
    p.wobble = 0;
    p.fallen = HOP.fallTime;
    p.falls++;
    if (!p.grounded) { p.vx *= 0.3; }
    return true;
  }
  return false;
}

/** Advance one step. Returns 'land' on the step that the hopper lands. */
export function stepHopper(p: Hopper, dt: number): 'land' | null {
  if (p.fallen > 0) {
    p.fallen = Math.max(0, p.fallen - dt);
    if (p.grounded) { p.vx = 0; return null; }
  }
  if (p.grounded) {
    p.groundT += dt;
    p.wobble = Math.max(0, p.wobble - 0.35 * dt);
    return null;
  }
  p.vh -= HOP.g * dt;
  p.h += p.vh * dt;
  p.x += p.vx * dt;
  if (p.h <= 0) {
    p.h = 0; p.vh = 0; p.vx = 0;
    p.grounded = true;
    p.groundT = 0;
    return 'land';
  }
  return null;
}

/** Computer hopper: taps after each landing with human-like timing noise. */
export class HopAI {
  private tapAt: number | null = null;
  private t = 0;
  private sd: number;
  constructor(diff: 'easy' | 'medium' | 'hard', private rng: Rng) {
    this.sd = diff === 'easy' ? 0.11 : diff === 'medium' ? 0.07 : 0.045;
  }
  update(p: Hopper, dt: number): boolean {
    this.t += dt;
    if (p.grounded && p.fallen <= 0 && this.tapAt === null) this.tapAt = this.t + Math.max(0, 0.17 + this.rng.gauss() * this.sd) - p.groundT;
    if (this.tapAt !== null && this.t >= this.tapAt) {
      this.tapAt = null;
      return true;
    }
    return false;
  }
}
