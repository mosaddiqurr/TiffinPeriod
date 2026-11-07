import type { Rng } from '../../engine/rng';

// 3D Short-Pitch Cricket simulation (pure; metres and seconds).
// Coordinates: x = sideways (+ = off side of a right-handed batter),
// y = along the pitch from the batter toward the bowler, h = height.
// The batter's stumps are at y = 0, the bowler's stumps at y = PITCH.
//
// Para rules: circular field. Along the ground over the rope = 4.
// Over the rope on the full = OUT ("six is out"). Caught, bowled and
// run out are out. Other runs come from running between the wickets.

export const FIELD = { radius: 26, pitch: 11, crease: 1.2 };
export const G = 9.8;
export const STUMPS = { half: 0.115, h: 0.71 };
export const CONTACT_Y = 1.5;
export const BATTER_X = -0.3;

export type DType = 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin';
export interface Delivery { type: DType; speed: number; tx: number; ty: number; swing: number; turn: number; rx: number }
export interface PathPt { t: number; x: number; y: number; h: number }
export interface Planned {
  d: Delivery; path: PathPt[];
  /** The ideal time to hit the ball (it reaches the hitting zone). */
  tContact: number;
  /** After this time the ball is too deep to hit. */
  tLate: number;
  /** The ball reaches the line of the stumps. */
  tStumps: number;
  at: PathPt; bounceT: number; hitsStumps: boolean; reachable: boolean;
}

const SPEEDS: Record<DType, number> = { fast: 21, medium: 17, slow: 12.5, offspin: 13, legspin: 13 };

export function makeDelivery(type: DType, tx: number, ty: number, rng: Rng, accuracy = 1): Delivery {
  const err = (1.15 - accuracy) * 0.6;
  return {
    type,
    speed: SPEEDS[type] * (0.96 + rng.next() * 0.08),
    tx: tx + rng.gauss() * err * 0.25,
    ty: Math.max(0.5, Math.min(FIELD.pitch - 1.5, ty + rng.gauss() * err)),
    swing: type === 'fast' || type === 'medium' ? rng.range(-1.4, 1.4) : 0,
    turn: type === 'offspin' ? -rng.range(0.9, 1.6) : type === 'legspin' ? rng.range(0.9, 1.6) : 0,
    rx: rng.range(-0.25, 0.25),
  };
}

/** Plan the whole delivery path (fixed 1/120 s steps, no randomness). */
export function plan(d: Delivery): Planned {
  const dt = 1 / 120;
  const y0 = FIELD.pitch - 0.6, h0 = 1.95;
  const dist = y0 - d.ty;
  const tb = dist / d.speed;
  let x = d.rx, y = y0, h = h0;
  let vx = (d.tx - d.rx) / tb - (d.swing * tb) / 2, vy = -d.speed, vh = (G * tb * tb / 2 - h0) / tb;
  const path: PathPt[] = [];
  let bounced = false, bounceT = tb, tContact = -1, tLate = -1, tStumps = -1;
  let at: PathPt = { t: 0, x, y, h };
  let hitsStumps = false;
  for (let t = 0; t < 3; t += dt) {
    if (!bounced) vx += d.swing * dt;
    vh -= G * dt;
    const py = y;
    x += vx * dt; y += vy * dt; h += vh * dt;
    if (!bounced && h <= 0) {
      h = 0; bounced = true; bounceT = t;
      vh = -vh * 0.62; vy *= 0.9; vx = vx * 0.9 + d.turn;
    }
    path.push({ t, x, y, h });
    if (tContact < 0 && y <= CONTACT_Y) { tContact = t; at = { t, x, y, h }; }
    if (tLate < 0 && y <= 0.2) tLate = t;
    if (py > 0 && y <= 0) { tStumps = t; hitsStumps = Math.abs(x) < STUMPS.half + 0.035 && h < STUMPS.h; }
    if (y < -2.5) break;
  }
  const reachable = Math.abs(at.x - BATTER_X) < 1.35 && at.h < 1.75;
  return { d, path, tContact, tLate, tStumps, at, bounceT, hitsStumps, reachable };
}

export function ballOnPath(p: Planned, t: number): PathPt {
  const i = Math.max(0, Math.min(p.path.length - 1, Math.round(t * 120)));
  return p.path[i];
}

// ---------- Batting ----------

export type Shot = 'defend' | 'ground' | 'loft';
export type Timing = 'perfect' | 'good' | 'early' | 'late' | 'edge' | 'miss';

/** `scale` widens (> 1) or narrows (< 1) the timing windows. */
export function judge(shot: Shot, dt: number, p: Planned, scale = 1): { timing: Timing; q: number } {
  if (!p.reachable) return { timing: 'miss', q: 0 };
  const a = Math.abs(dt);
  const win = (shot === 'defend' ? 0.2 : 0.15) * scale;
  if (a <= 0.035 * scale) return { timing: 'perfect', q: 1 };
  if (a <= win * 0.55) return { timing: 'good', q: 1 - a / win };
  if (a <= win) return { timing: dt < 0 ? 'early' : 'late', q: Math.max(0.15, 1 - a / win) };
  if (a <= win + 0.07 * scale) return { timing: 'edge', q: 0.1 };
  return { timing: 'miss', q: 0 };
}

export interface Launch { v: number; elev: number; dir: number }

/**
 * The ball off the bat. `aim` = chosen direction (0 = straight back past the
 * bowler, + = off side), or null for a natural shot. Early timing pulls the
 * ball to the leg side, late timing pushes it to the off side.
 */
export function launch(shot: Shot, aim: number | null, dt: number, j: { timing: Timing; q: number }, p: Planned, rng: Rng): Launch {
  const at = p.at;
  if (j.timing === 'edge') return { v: rng.range(6, 12), elev: rng.range(0.1, 0.5), dir: (rng.chance(0.6) ? 1 : -1) * rng.range(2.3, 2.9) };
  const natural = Math.max(-1.6, Math.min(1.6, (at.x - BATTER_X) * 1.1 + dt * 7));
  let dir = aim === null ? natural : aim + dt * 4 + rng.gauss() * 0.07;
  // Hitting against the line of the ball is harder.
  const against = aim === null ? 0 : Math.max(0, Math.abs(aim - natural) - 0.9);
  const q = Math.max(0.1, j.q - against * 0.35);
  if (shot === 'defend') return { v: rng.range(2.5, 5.5), elev: rng.range(0, 0.04), dir: dir * 0.4 };
  dir = Math.max(-2.6, Math.min(2.6, dir));
  // A clean loft carries to the rope: sometimes over it on the full, and a six is out.
  if (shot === 'loft') return { v: 11.5 + 10 * q + rng.range(-0.8, 0.8), elev: 0.42 + rng.range(0, 0.12) + (1 - q) * 0.15, dir };
  const bounceLift = Math.min(1, at.h / 1.2) * 0.08;
  return { v: 11 + 16 * q + rng.range(-1, 1), elev: Math.max(0.015, 0.025 + (1 - q) ** 2 * 0.34 + bounceLift + rng.gauss() * 0.02), dir };
}

// ---------- The ball in play ----------

export type FState = 'idle' | 'chase' | 'hold' | 'throw' | 'back';
export interface Fielder { id: number; x: number; y: number; hx: number; hy: number; state: FState; t: number; keeper: boolean }
export interface Runner { end: 0 | 1; running: boolean; p: number; out: boolean }
export type OutHow = 'bowled' | 'caught' | 'six-out' | 'run-out';
export type PlayEvent = { type: 'four' | 'six-out' | 'caught' | 'gather' | 'throw' | 'run' | 'run-out' | 'miss-throw' | 'dead' | 'drop' | 'bounce' | 'stumps'; who?: number };

export const RUN_T = 1.3;
/** Children's fielding: the time to gather and aim, and the throw speed. */
export const HOLD_T = 0.5;
export const THROW_V = 19;
const BALL_DRAG = 0.012;

export const FIELD_POS: Array<[number, number]> = [
  [0, -3.2],          // keeper
  [8, 9],             // mid-off
  [-8, 9],            // mid-on
  [13, 1],            // point
  [-13, 2],           // square leg
  [10, 19],           // long-off
  [-10, 19],          // long-on
  [12, -9],           // third man
];

export class Play {
  ball = { x: 0, y: CONTACT_Y, h: 0.8, vx: 0, vy: 0, vh: 0, bounces: 0, state: 'free' as 'free' | 'held' | 'thrown' | 'dead', holder: -1 };
  throwTo: 0 | 1 = 0;
  throwT = 0;
  throwDur = 0;
  throwFrom = { x: 0, y: 0 };
  fielders: Fielder[];
  runners: [Runner, Runner] = [{ end: 0, running: false, p: 0, out: false }, { end: 1, running: false, p: 0, out: false }];
  runs = 0;
  four = false;
  out: OutHow | null = null;
  outRunner = -1;
  dead = false;
  t = 0;
  wantRuns = 0;
  private deadT = 0;
  events: PlayEvent[] = [];

  constructor(l: Launch, private rng: Rng, private catchSkill = 0.75, from?: { x: number; y: number; h: number }) {
    const b = this.ball;
    if (from) { b.x = from.x; b.y = from.y; b.h = from.h; }
    b.vx = l.v * Math.cos(l.elev) * Math.sin(l.dir);
    b.vy = l.v * Math.cos(l.elev) * Math.cos(l.dir);
    b.vh = l.v * Math.sin(l.elev);
    this.fielders = FIELD_POS.map(([x, y], i) => ({ id: i, x, y, hx: x, hy: y, state: 'idle', t: 0.2 + rng.range(0, 0.15), keeper: i === 0 }));
    this.fielders.push({ id: 8, x: 0.5, y: FIELD.pitch - 0.8, hx: 0.5, hy: FIELD.pitch - 0.8, state: 'idle', t: 0.3, keeper: false }); // the bowler
    // The two nearest fielders to the ball's line chase it.
    const dir = Math.atan2(b.vx, b.vy);
    const rank = this.fielders.map((f) => ({ f, d: Math.abs(angDiff(Math.atan2(f.x, f.y), dir)) * 10 + Math.hypot(f.x, f.y) * 0.2 })).sort((a, c) => a.d - c.d);
    rank.slice(0, 2).forEach((r) => (r.f.state = 'chase'));
  }

  /** The batting side asks for a run (or one more run). */
  callRun() {
    if (this.dead || this.out) return;
    this.wantRuns++;
  }

  private startRun() {
    for (const r of this.runners) { r.running = true; r.p = 0; }
    this.events.push({ type: 'run' });
  }

  get running() {
    return this.runners[0].running;
  }

  step(dt: number) {
    if (this.dead) return;
    this.t += dt;
    const b = this.ball;
    // Runners
    if (!this.running && this.wantRuns > 0 && !this.out) { this.wantRuns--; this.startRun(); }
    if (this.running) {
      for (const r of this.runners) r.p = Math.min(1, r.p + dt / RUN_T);
      if (this.runners[0].p >= 1) {
        for (const r of this.runners) { r.running = false; r.end = (1 - r.end) as 0 | 1; r.p = 0; }
        this.runs++;
      }
    }
    if (b.state === 'free') this.stepBall(dt);
    else if (b.state === 'thrown') this.stepThrow(dt);
    if (this.dead) return;
    for (const f of this.fielders) this.stepFielder(f, dt);
    // Dead ball: a fielder holds it and nobody runs
    if ((b.state === 'held' || b.state === 'dead') && !this.running && this.wantRuns === 0) {
      this.deadT += dt;
      if (this.deadT > 0.9) this.end();
    } else this.deadT = 0;
    if (this.t > 20) this.end();
  }

  /** End the ball now (also used when the chasing side reaches the target). */
  end() {
    if (this.dead) return;
    this.dead = true;
    this.events.push({ type: 'dead' });
  }

  private stepBall(dt: number) {
    const b = this.ball;
    const sp = Math.hypot(b.vx, b.vy, b.vh);
    b.vx -= b.vx * BALL_DRAG * sp * dt; b.vy -= b.vy * BALL_DRAG * sp * dt; b.vh -= (b.vh * BALL_DRAG * sp + G) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.h += b.vh * dt;
    if (b.h <= 0) {
      b.h = 0;
      if (Math.abs(b.vh) > 1.3) { b.vh = -b.vh * 0.55; b.vx *= 0.72; b.vy *= 0.72; b.bounces++; this.events.push({ type: 'bounce' }); }
      else {
        b.vh = 0;
        if (b.bounces === 0) b.bounces = 1;
        const g = Math.hypot(b.vx, b.vy);
        const k = g > 0 ? Math.max(0, g - 5.5 * dt) / g : 0;
        b.vx *= k; b.vy *= k;
      }
    }
    if (Math.hypot(b.x, b.y) >= FIELD.radius) {
      if (b.bounces === 0) { this.out = 'six-out'; this.events.push({ type: 'six-out' }); }
      else { this.four = true; this.events.push({ type: 'four' }); }
      for (const r of this.runners) r.running = false;
      this.end();
    }
  }

  private stepThrow(dt: number) {
    const b = this.ball;
    this.throwT += dt;
    const k = Math.min(1, this.throwT / this.throwDur);
    const ty = this.throwTo === 0 ? 0 : FIELD.pitch;
    b.x = this.throwFrom.x * (1 - k);
    b.y = this.throwFrom.y + (ty - this.throwFrom.y) * k;
    b.h = 1.2 + Math.sin(k * Math.PI) * Math.min(4, this.throwDur * 2);
    if (k >= 1) {
      // Run out: a runner who is still running toward this end.
      const victim = this.runners.findIndex((r) => r.running && (1 - r.end) === this.throwTo && r.p < 0.97);
      // A throw from far away can miss the stumps; a runner who is well short is almost always out.
      const short = victim >= 0 ? 1 - this.runners[victim].p : 0;
      const hit = victim >= 0 && this.rng.chance(Math.min(0.95, 0.5 + short * 1.4 - this.throwDur * 0.2));
      if (victim >= 0 && !hit) this.events.push({ type: 'miss-throw' });
      if (hit) {
        this.out = 'run-out';
        this.outRunner = victim;
        this.events.push({ type: 'run-out', who: victim });
        this.events.push({ type: 'stumps' });
        for (const r of this.runners) r.running = false;
        this.end();
        return;
      }
      b.state = 'dead';
      b.h = 0.9;
      this.wantRuns = 0;
    }
  }

  private stepFielder(f: Fielder, dt: number) {
    const b = this.ball;
    f.t -= dt;
    if (f.t > 0 && f.state !== 'hold') return;
    if (f.state === 'chase' && b.state === 'free') {
      const lead = Math.min(0.7, Math.hypot(b.x - f.x, b.y - f.y) / 11);
      const tx = b.x + b.vx * lead, ty = b.y + b.vy * lead;
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      const run = 6.6 * dt;
      if (d > run) { f.x += (dx / d) * run; f.y += (dy / d) * run; } else { f.x = tx; f.y = ty; }
      const near = Math.hypot(b.x - f.x, b.y - f.y);
      if (b.bounces === 0 && near < 1.2 && b.h > 0.3 && b.h < 2.5) {
        const hard = Math.min(1, Math.hypot(b.vx, b.vy) / 26);
        if (this.rng.chance(this.catchSkill * (1 - hard * 0.55))) {
          this.out = 'caught';
          this.events.push({ type: 'caught', who: f.id });
          for (const r of this.runners) r.running = false;
          b.state = 'held'; b.holder = f.id;
          this.end();
          return;
        }
        this.events.push({ type: 'drop', who: f.id });
        f.t = 0.6; b.vx *= 0.35; b.vy *= 0.35; b.vh = Math.abs(b.vh) * 0.3;
      } else if (near < 0.85 && b.h < 0.7 && b.bounces > 0) {
        b.state = 'held'; b.holder = f.id; f.state = 'hold'; f.t = HOLD_T;
        this.events.push({ type: 'gather', who: f.id });
        for (const o of this.fielders) if (o !== f && o.state === 'chase') o.state = 'back';
      }
    } else if (f.state === 'hold' && b.state === 'held' && b.holder === f.id) {
      b.x = f.x; b.y = f.y; b.h = 1.0;
      if (f.t <= 0) {
        // Throw to the end where a runner is in most danger, else to the keeper.
        const run = this.runners.find((r) => r.running);
        const to: 0 | 1 = run ? ((1 - run.end) as 0 | 1) : 0;
        const endDanger = run ? (1 - run.p) * RUN_T : 9;
        const dist0 = Math.hypot(f.x, f.y), dist1 = Math.hypot(f.x, f.y - FIELD.pitch);
        this.throwTo = run ? (dist1 / THROW_V < endDanger && dist1 < dist0 ? (1 as const) : to) : (dist0 < dist1 ? 0 : 1);
        this.throwFrom = { x: f.x, y: f.y };
        this.throwT = 0;
        this.throwDur = Math.max(0.25, (this.throwTo === 0 ? dist0 : dist1) / THROW_V);
        b.state = 'thrown';
        f.state = 'back';
        this.events.push({ type: 'throw', who: f.id });
      }
    } else if (f.state === 'back' || (f.state === 'chase' && b.state !== 'free')) {
      const dx = f.hx - f.x, dy = f.hy - f.y, d = Math.hypot(dx, dy);
      if (d > 0.1) { const run = 4 * dt; f.x += (dx / d) * Math.min(d, run); f.y += (dy / d) * Math.min(d, run); }
    }
  }

  /** For the computer batting side: is one more run safe? */
  safeToRun(margin = 0.25): boolean {
    const b = this.ball;
    if (this.out || this.dead) return false;
    if (b.state === 'thrown' || b.state === 'dead') return false;
    let best = Infinity;
    // Only the fielders who are going for the ball matter.
    for (const f of this.fielders) {
      if (f.state !== 'chase' && !(b.state === 'held' && b.holder === f.id)) continue;
      const reach = b.state === 'held' && b.holder === f.id ? Math.max(0, f.t) : Math.hypot(b.x + b.vx * 0.4 - f.x, b.y + b.vy * 0.4 - f.y) / 6.6 + 0.35;
      const throwT = Math.min(Math.hypot(b.x, b.y), Math.hypot(b.x, b.y - FIELD.pitch)) / THROW_V;
      best = Math.min(best, reach + throwT);
    }
    const left = this.running ? (1 - this.runners[0].p) * RUN_T + RUN_T : RUN_T;
    return best > left + margin;
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------- Computer players ----------

export type Diff = 'easy' | 'medium' | 'hard';

export function aiDelivery(diff: Diff, rng: Rng): Delivery {
  const types: DType[] = ['fast', 'medium', 'medium', 'slow', 'offspin', 'legspin'];
  const ty = rng.pick([1.4, 2.8, 2.8, 4.2, 5.5]);
  const tx = rng.pick([-0.25, 0, 0.12, 0.25, 0.45]);
  return makeDelivery(rng.pick(types), tx, ty, rng, diff === 'easy' ? 0.7 : diff === 'medium' ? 0.9 : 1.1);
}

/** Computer batter: chooses a shot and a direction, then times it with noise. */
export function aiBat(p: Planned, diff: Diff, rng: Rng, need?: number, ballsLeft?: number): { shot: Shot; aim: number | null; dt: number } {
  const sd = diff === 'easy' ? 0.09 : diff === 'medium' ? 0.06 : 0.04;
  const rate = need !== undefined && ballsLeft ? need / Math.max(1, ballsLeft) : 1;
  let shot: Shot = 'ground';
  if (p.at.h > 1.25 && rng.chance(0.5)) shot = 'defend';
  else if (rng.chance(rate > 2 ? 0.35 : 0.06)) shot = 'loft';
  else if (rng.chance(0.12)) shot = 'defend';
  // Aim for a gap between the fielders.
  const gaps = [0.45, -0.45, 1.15, -1.15, 0.1, -0.1, 1.9];
  const aim = rng.chance(0.75) ? rng.pick(gaps) : null;
  return { shot, aim, dt: rng.gauss() * sd };
}
