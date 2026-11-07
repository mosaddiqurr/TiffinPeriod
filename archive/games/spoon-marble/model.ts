import type { Rng } from '../../engine/rng';

// Spoon & Marble model (pure). One button: hold to run.
// The marble sits in a shallow spoon bowl (a spring toward the centre).
// Speeding up pushes the marble back; slowing down rolls it forward.
// Uneven ground gives random kicks that grow with the square of the speed.
// |m| > 1 → the marble falls.

export const SPOON = { accel: 260, brake: 320, vmax: 230, bowl: 6, damp: 1.3, inertia: 0.012, kick: 1.5, pickup: 1.8 };

export interface Runner {
  x: number; v: number;
  hold: boolean;
  m: number; mv: number;       // marble position (−1 back … +1 front) and velocity
  phase: number;
  nextKick: number;
  down: number;                // seconds left to pick the marble up
  drops: number;
  t: number;
}

export function newRunner(x: number): Runner {
  return { x, v: 0, hold: false, m: 0, mv: 0, phase: 0, nextKick: 0.8, down: 0, drops: 0, t: 0 };
}

/** One fixed step. Returns 'drop' on the step that the marble falls. */
export function stepRunner(r: Runner, dt: number, rng: Rng, dropRule: 'pickup' | 'start', startX: number): 'drop' | null {
  r.t += dt;
  if (r.down > 0) {
    r.down = Math.max(0, r.down - dt);
    r.v = 0;
    if (r.down === 0) { r.m = 0; r.mv = 0; }
    return null;
  }
  const v0 = r.v;
  r.v = r.hold ? Math.min(SPOON.vmax, r.v + SPOON.accel * dt) : Math.max(0, r.v - SPOON.brake * dt);
  const a = (r.v - v0) / dt;
  const s = r.v / SPOON.vmax;
  r.phase += r.v * 0.06 * dt;
  const bob = s * s * 9 * Math.sin(r.phase * 2);
  const acc = -SPOON.bowl * r.m - SPOON.damp * r.mv - a * SPOON.inertia + bob;
  r.mv += acc * dt;
  if (r.v > 5 && r.t >= r.nextKick) {
    r.mv += rng.range(-1, 1) * SPOON.kick * s * s;
    r.nextKick = r.t + rng.range(0.55, 1.2);
  }
  r.m += r.mv * dt;
  r.x += r.v * dt;
  if (Math.abs(r.m) > 1) {
    r.drops++;
    r.down = SPOON.pickup;
    r.v = 0;
    if (dropRule === 'start') r.x = startX;
    return 'drop';
  }
  return null;
}

/** Computer runner: holds or releases to keep the marble near the centre, with a reaction delay. */
export class SpoonAI {
  private seen: number[] = [];
  private cfg: { delay: number; band: number; speed: number };
  constructor(diff: 'easy' | 'medium' | 'hard') {
    this.cfg = diff === 'easy' ? { delay: 22, band: 0.28, speed: 0.62 } : diff === 'medium' ? { delay: 14, band: 0.34, speed: 0.75 } : { delay: 8, band: 0.4, speed: 0.86 };
  }
  update(r: Runner) {
    this.seen.push(r.m);
    const m = this.seen.length > this.cfg.delay ? this.seen.shift()! : 0;
    const wantSpeed = r.v < SPOON.vmax * this.cfg.speed;
    if (m < -this.cfg.band) r.hold = false;        // marble rolling back: slow down
    else if (m > this.cfg.band) r.hold = true;     // marble rolling forward: speed up
    else r.hold = wantSpeed;
  }
}
