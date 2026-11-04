import type { Rng } from '../../engine/rng';

// Three-Legged Race model (pure).
// The pair has two "feet" to move in turn: the outer legs (L) and the tied
// middle legs (R). Good steps alternate L, R, L, R at a steady pace.
// Same foot twice, both feet together, or stepping too fast = stumble (wobble).

export const STEP = { push: 175, drag: 4, tooFast: 0.16, slow: 0.5, together: 0.07, fallTime: 1.5 };
export type Foot = 'L' | 'R';
export type StepJudge = 'good' | 'slow' | 'fast' | 'same' | 'together' | 'down';

export interface Pair {
  x: number; v: number;
  last: Foot | null;
  lastT: number;
  wobble: number;
  fallen: number;
  steps: number; stumbles: number; falls: number;
  /** Visual step phase (radians). */
  phase: number;
}

export function newPair(x: number): Pair {
  return { x, v: 0, last: null, lastT: -10, wobble: 0, fallen: 0, steps: 0, stumbles: 0, falls: 0, phase: 0 };
}

export function stepFoot(p: Pair, foot: Foot, t: number): StepJudge {
  if (p.fallen > 0) return 'down';
  const dt = t - p.lastT;
  let j: StepJudge;
  if (p.last === foot && dt < 0.9) { j = 'same'; p.wobble += 0.45; }
  else if (p.last !== null && p.last !== foot && dt < STEP.together) { j = 'together'; p.wobble += 0.5; }
  else if (p.last !== null && dt < STEP.tooFast) { j = 'fast'; p.wobble += 0.3; p.v += STEP.push * 0.6; }
  else if (dt > STEP.slow) { j = 'slow'; p.v += STEP.push * 0.75; }
  else { j = 'good'; p.v += STEP.push; p.wobble = Math.max(0, p.wobble - 0.08); }
  if (j === 'same' || j === 'together' || j === 'fast') p.stumbles++;
  if (j === 'good' || j === 'slow' || j === 'fast') { p.steps++; p.phase += Math.PI; }
  p.last = foot;
  p.lastT = t;
  if (p.wobble >= 1) { p.wobble = 0; p.fallen = STEP.fallTime; p.falls++; p.v = 0; p.last = null; }
  return j;
}

export function stepPair(p: Pair, dt: number) {
  if (p.fallen > 0) { p.fallen = Math.max(0, p.fallen - dt); p.v = 0; return; }
  p.x += p.v * dt;
  p.v *= Math.exp(-STEP.drag * dt);
  p.wobble = Math.max(0, p.wobble - 0.4 * dt);
}

/** A computer pair: steady cadence with timing noise and some coordination slips. */
export class PairAI {
  private next = 0.4;
  private foot: Foot = 'L';
  private cfg: { gap: number; sd: number; slip: number };
  constructor(diff: 'easy' | 'medium' | 'hard', private rng: Rng) {
    this.cfg = diff === 'easy' ? { gap: 0.36, sd: 0.07, slip: 0.07 } : diff === 'medium' ? { gap: 0.3, sd: 0.05, slip: 0.035 } : { gap: 0.26, sd: 0.03, slip: 0.012 };
  }
  update(p: Pair, t: number): StepJudge | null {
    if (p.fallen > 0) { this.next = t + 0.3; this.foot = 'L'; return null; }
    if (t < this.next) return null;
    this.next = t + Math.max(0.12, this.cfg.gap + this.rng.gauss() * this.cfg.sd);
    const f = this.rng.chance(this.cfg.slip) ? (this.foot === 'L' ? 'R' : 'L') : this.foot; // a slip repeats the same foot
    const j = stepFoot(p, f === this.foot ? this.foot : p.last ?? 'L', t);
    this.foot = this.foot === 'L' ? 'R' : 'L';
    return j;
  }
}
