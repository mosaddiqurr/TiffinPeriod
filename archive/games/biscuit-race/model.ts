import { bob, circlesOverlap, nudgeBob, predictBob, stepPendulum, type Pendulum } from '../../engine/physics';
import type { Rng } from '../../engine/rng';

// Biscuit Race model. Side view, y is HEIGHT above the ground (up = positive).
//
// Course (world units):  start ─── biscuit line ─── finish
// A biscuit hangs on a string from a rope over each lane. It swings as a
// damped pendulum, and wind gusts push it. The racer keeps both hands
// behind the back. The racer must jump and catch the biscuit with the mouth:
//   - mouth circle touches the biscuit near its centre → clean bite (caught)
//   - head or mouth touches it off-centre → bump: the biscuit swings away
// A racer cannot pass the biscuit line without the biscuit.
// With the biscuit in the mouth, the racer runs to the finish.

export type Difficulty = 'easy' | 'medium' | 'hard';

export const COURSE = { start: 70, line: 560, finish: 1030 };
export const BODY = {
  accel: 1500, maxSpeed: 290, friction: 1700,
  jumpV: 640, gravity: 1800,
  mouthH: 141, mouthFwd: 12, mouthR: 10,
  headH: 150, headR: 17,
};
export const STRING = { anchorH: 360, L: 110, biscuitR: 19 };

export const DIFF: Record<Difficulty, { wind: number; tol: number; start: number; damping: number }> = {
  easy: { wind: 0.25, tol: 16, start: 0.12, damping: 0.5 },
  medium: { wind: 0.9, tol: 12, start: 0.25, damping: 0.25 },
  hard: { wind: 1.7, tol: 9, start: 0.4, damping: 0.12 },
};

export interface Controls { left: boolean; right: boolean; jump: boolean }

export interface Racer {
  x: number; h: number; vx: number; vh: number;
  grounded: boolean;
  hasBiscuit: boolean;
  finished: boolean;
  finishTime: number | null;
  jumps: number;
  bumps: number;
  firstJumpCatch: boolean;
  /** Bite marks on the biscuit (visual only). */
  chips: number;
  dizzy: number;
  step: number;
  ctl: Controls;
  jumpLatch: boolean;
}

export interface LaneState {
  racer: Racer;
  pend: Pendulum;
  /** Biscuit has left the string (it is in the mouth). */
  taken: boolean;
}

export type RaceEvent = { type: 'jump' | 'bump' | 'catch' | 'finish' | 'land'; lane: number };

export class BiscuitRaceModel {
  t = 0;
  lanes: LaneState[];
  events: RaceEvent[] = [];
  private windPhase: number;

  constructor(public lanesN: number, public diff: Difficulty, rng: Rng) {
    const d = DIFF[diff];
    this.windPhase = rng.range(0, 6.28);
    const start = rng.range(-d.start, d.start);
    this.lanes = Array.from({ length: lanesN }, () => ({
      racer: {
        x: COURSE.start, h: 0, vx: 0, vh: 0, grounded: true, hasBiscuit: false, finished: false, finishTime: null,
        jumps: 0, bumps: 0, firstJumpCatch: false, chips: 0, dizzy: 0, step: 0,
        ctl: { left: false, right: false, jump: false }, jumpLatch: false,
      },
      // All lanes start with the same swing, so the race is fair.
      pend: { ax: COURSE.line, ay: STRING.anchorH, L: STRING.L, theta: start, omega: 0, damping: d.damping, g: BODY.gravity },
      taken: false,
    }));
  }

  /** Wind as an angular acceleration on the biscuit. The same wind blows on every lane. */
  wind(t: number): number {
    const w = DIFF[this.diff].wind;
    return w * (Math.sin(0.8 * t + this.windPhase) + 0.6 * Math.sin(2.1 * t + this.windPhase * 1.7)) * 1.6;
  }

  /** Biscuit centre in world coordinates (height up). */
  biscuit(l: LaneState): { x: number; h: number } {
    const b = bob(l.pend);
    // physics.bob() uses y down from the anchor; convert to height.
    return { x: b.x, h: l.pend.ay - (b.y - l.pend.ay) };
  }

  mouth(r: Racer): { x: number; h: number } {
    return { x: r.x + BODY.mouthFwd, h: r.h + BODY.mouthH };
  }

  get done(): boolean {
    return this.lanes.every((l) => l.racer.finished);
  }

  update(dt: number) {
    this.t += dt;
    const wind = this.wind(this.t);
    this.lanes.forEach((l, i) => {
      if (!l.taken) stepPendulum(l.pend, dt, wind);
      else stepPendulum(l.pend, dt, wind * 2); // the empty string flaps more
      this.stepRacer(l, i, dt);
    });
  }

  private stepRacer(l: LaneState, i: number, dt: number) {
    const r = l.racer;
    if (r.finished) {
      r.vx *= Math.exp(-4 * dt);
      r.x += r.vx * dt;
      return;
    }
    const dir = (r.ctl.right ? 1 : 0) - (r.ctl.left ? 1 : 0);
    const air = r.grounded ? 1 : 0.45; // less control in the air
    if (dir !== 0) r.vx += dir * BODY.accel * air * dt;
    else if (r.grounded) {
      const f = BODY.friction * dt;
      r.vx = Math.abs(r.vx) <= f ? 0 : r.vx - Math.sign(r.vx) * f;
    }
    const max = r.dizzy > 0 ? BODY.maxSpeed * 0.5 : BODY.maxSpeed;
    r.vx = Math.max(-max, Math.min(max, r.vx));
    r.x += r.vx * dt;
    // Rope barrier: no biscuit, no passing the line.
    const barrier = COURSE.line + 40;
    if (!r.hasBiscuit && r.x > barrier) { r.x = barrier; r.vx = Math.min(0, r.vx); }
    if (r.x < 20) { r.x = 20; r.vx = 0; }
    // Jump: one jump per press, only from the ground.
    if (r.ctl.jump && !r.jumpLatch && r.grounded && r.dizzy <= 0) {
      r.vh = BODY.jumpV;
      r.grounded = false;
      r.jumps++;
      this.events.push({ type: 'jump', lane: i });
    }
    r.jumpLatch = r.ctl.jump;
    if (!r.grounded) {
      r.vh -= BODY.gravity * dt;
      r.h += r.vh * dt;
      if (r.h <= 0) {
        r.h = 0; r.vh = 0; r.grounded = true;
        this.events.push({ type: 'land', lane: i });
      }
    }
    r.dizzy = Math.max(0, r.dizzy - dt);
    if (r.grounded && Math.abs(r.vx) > 5) r.step += dt * Math.abs(r.vx) * 0.06;
    // Biscuit contact
    if (!l.taken && !r.grounded) this.contact(l, i);
    if (r.hasBiscuit && r.x >= COURSE.finish) {
      r.finished = true;
      r.finishTime = this.t;
      this.events.push({ type: 'finish', lane: i });
    }
  }

  private contact(l: LaneState, i: number) {
    const r = l.racer;
    const b = this.biscuit(l);
    const m = this.mouth(r);
    const tol = DIFF[this.diff].tol;
    const R = STRING.biscuitR;
    const headX = r.x + 4, headH = r.h + BODY.headH;
    const touches = circlesOverlap(m.x, m.h, BODY.mouthR, b.x, b.h, R) || circlesOverlap(headX, headH, BODY.headR, b.x, b.h, R);
    if (!touches) return;
    // The racer tips the head back and bites. It works only if the mouth is
    // centred under the biscuit (within the difficulty tolerance).
    if (Math.abs(b.x - m.x) <= tol) {
      l.taken = true;
      r.hasBiscuit = true;
      if (r.jumps === 1) r.firstJumpCatch = true;
      // The string loses the biscuit's weight and springs a little.
      l.pend.omega += (r.vx / l.pend.L) * 0.5;
      this.events.push({ type: 'catch', lane: i });
      return;
    }
    {
      // Bump: push the biscuit away from the face and drop the racer.
      const away = b.x >= headX ? 1 : -1;
      nudgeBob(l.pend, away * (180 + Math.abs(r.vx) * 0.6), 0);
      r.vh = Math.min(r.vh, -80);
      r.bumps++;
      r.chips = Math.min(3, r.chips + 1);
      r.dizzy = 0.35;
      this.events.push({ type: 'bump', lane: i });
    }
  }

  takeEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

// ---------- Computer racer ----------

const AIP: Record<Difficulty, { timeErr: number; posTol: number; hesitate: number }> = {
  easy: { timeErr: 0.1, posTol: 12, hesitate: 0.5 },
  medium: { timeErr: 0.055, posTol: 8, hesitate: 0.25 },
  hard: { timeErr: 0.03, posTol: 5, hesitate: 0.1 },
};

/** Time from take-off until the mouth reaches the biscuit height (first crossing). */
export function timeToHeight(dh: number): number | null {
  // dh = v t − g t²/2  →  t = (v − √(v² − 2 g dh)) / g
  const v = BODY.jumpV, g = BODY.gravity;
  const disc = v * v - 2 * g * dh;
  if (disc < 0) return null;
  return (v - Math.sqrt(disc)) / g;
}

export class BiscuitAI {
  private wait = 0;
  constructor(private lane: number, private diff: Difficulty, private rng: Rng) {}

  update(m: BiscuitRaceModel, dt: number) {
    const l = m.lanes[this.lane];
    const r = l.racer;
    const p = AIP[this.diff];
    r.ctl.jump = false;
    if (r.finished) { r.ctl.left = r.ctl.right = false; return; }
    if (r.hasBiscuit) { r.ctl.left = false; r.ctl.right = true; return; }
    if (!r.grounded) { r.ctl.left = r.ctl.right = false; return; }
    this.wait -= dt;
    // Predict where the biscuit will be when a jump made now reaches it.
    const b = m.biscuit(l);
    const tHit = (timeToHeight(b.h - BODY.mouthH) ?? 0.3) + this.rng.gauss() * p.timeErr * 0.3;
    const future = predictBob(l.pend, Math.max(0, tHit));
    const fx = future.x;
    const want = fx - BODY.mouthFwd;
    const dx = want - r.x;
    if (Math.abs(dx) > p.posTol) {
      r.ctl.right = dx > 0;
      r.ctl.left = dx < 0;
      return;
    }
    r.ctl.left = r.ctl.right = false;
    if (Math.abs(r.vx) < 60 && this.wait <= 0) {
      // Human-like timing error: sometimes jump a little early or late.
      this.wait = p.hesitate + this.rng.range(0, p.hesitate);
      if (this.rng.chance(0.85)) r.ctl.jump = true;
    }
  }
}
