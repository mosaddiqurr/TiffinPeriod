import type { Rng } from '../../engine/rng';

// Pen Fight physics: two real pens sliding on a school desk, seen from above.
// Units are centimetres, grams and seconds. Pure and deterministic (fixed 1/240 s step),
// so the computer can try flicks on a copy, and an online match would only need to send
// each flick.
//
// - A pen is a rod (capsule) with its own length, thickness, weight and grip.
// - Friction is the real sliding kind (Coulomb), worked out at points along the pen, so a
//   spinning pen curves and stops the way a pen on a desk does.
// - A flick is the finger hitting one point of the pen: near the middle it pushes the pen
//   straight, near an end it spins it. A heavier pen takes more from the same finger
//   (more momentum) but slides less far.
// - Pens bounce off each other with a little grip, which turns them.
// - A pen falls only when its centre of mass goes past the edge of the desk, so a pen can
//   hang over the edge and survive.

/** One student's half of a school bench, close up. */
export const DESK = { w: 60, d: 38 };
export const G = 981;
export const STEP = 1 / 240;
const FINGER_MASS = 8;
const FINGER_E = 0.6;
/** Fastest finger (cm/s) at full power. */
export const FINGER_MAX = 235;
const PEN_E = 0.55;
const PEN_MU = 0.32;
const SAMPLES = 8;
const REG = 2;

export type PenId = 'classic' | 'gel';

export interface PenSpec {
  id: PenId;
  len: number;
  r: number;
  mass: number;
  mu: number;
}

/**
 * The two pens every Bangladeshi school bag had:
 * - classic: the light white six-sided ballpoint with a coloured cap. Quick and long-range,
 *   but easy to send off the desk yourself.
 * - gel: the heavier gel pen with a rubber grip. Slides less, hits harder, grips the desk.
 */
export const PENS: Record<PenId, PenSpec> = {
  classic: { id: 'classic', len: 14.2, r: 0.45, mass: 5.5, mu: 0.2 },
  gel: { id: 'gel', len: 14.6, r: 0.56, mass: 10.5, mu: 0.25 },
};

export interface PenBody {
  spec: PenSpec;
  x: number; y: number; a: number;
  vx: number; vy: number; w: number;
  out: boolean;
  /** Where it went over (for the fall animation): outward edge normal. */
  fallN?: [number, number];
}

export interface PenPose { x: number; y: number; a: number }
/** t = grab point along the pen (−0.5 … 0.5), dir = shot direction, power 0 … 1. */
export interface Flick { t: number; dir: number; power: number }

export const inertia = (s: PenSpec) => (s.mass * (s.len * s.len + 3 * s.r * s.r)) / 12;

export function makePen(spec: PenSpec, p: PenPose): PenBody {
  return { spec, x: p.x, y: p.y, a: p.a, vx: 0, vy: 0, w: 0, out: false };
}

export class PenWorld {
  pens: PenBody[];
  t = 0;
  /** Contacts this step (impulse size), for sounds. */
  hits: number[] = [];

  constructor(specs: PenSpec[], poses: PenPose[]) {
    this.pens = specs.map((s, i) => makePen(s, poses[i]));
  }

  clone(): PenWorld {
    const w = new PenWorld([], []);
    w.pens = this.pens.map((p) => ({ ...p, fallN: p.fallN ? ([...p.fallN] as [number, number]) : undefined }));
    w.t = this.t;
    return w;
  }

  pose(i: number): PenPose {
    const p = this.pens[i];
    return { x: p.x, y: p.y, a: p.a };
  }

  get out(): boolean[] { return this.pens.map((p) => p.out); }

  /** The finger hits pen i at point t along it, moving in direction dir. */
  flick(i: number, f: Flick) {
    const p = this.pens[i];
    const s = p.spec;
    const I = inertia(s);
    const u = Math.max(0, Math.min(1, f.power)) * FINGER_MAX;
    const dx = Math.cos(f.dir), dy = Math.sin(f.dir);
    const t = Math.max(-0.5, Math.min(0.5, f.t));
    const rx = Math.cos(p.a) * t * s.len, ry = Math.sin(p.a) * t * s.len;
    const rxd = rx * dy - ry * dx;
    const mEff = 1 / (1 / s.mass + (rxd * rxd) / I);
    const J = (((1 + FINGER_E) * FINGER_MASS * mEff) / (FINGER_MASS + mEff)) * u;
    p.vx += (J * dx) / s.mass;
    p.vy += (J * dy) / s.mass;
    p.w += (rxd * J) / I;
  }

  step(dt = STEP) {
    this.hits = [];
    for (const p of this.pens) if (!p.out) friction(p, dt);
    for (const p of this.pens) {
      if (p.out) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
    }
    for (let i = 0; i < this.pens.length; i++) for (let j = i + 1; j < this.pens.length; j++) {
      const a = this.pens[i], b = this.pens[j];
      if (a.out || b.out) continue;
      const h = collide(a, b);
      if (h > 0) this.hits.push(h);
    }
    for (const p of this.pens) {
      if (p.out) continue;
      const hx = DESK.w / 2, hy = DESK.d / 2;
      if (Math.abs(p.x) > hx || Math.abs(p.y) > hy) {
        p.out = true;
        // The edge it crossed: the one it is furthest past.
        p.fallN = Math.abs(p.x) - hx > Math.abs(p.y) - hy ? [Math.sign(p.x), 0] : [0, Math.sign(p.y)];
      }
    }
    this.t += dt;
  }

  settled(): boolean {
    return this.pens.every((p) => p.out || (Math.hypot(p.vx, p.vy) < 0.4 && Math.abs(p.w) < 0.06));
  }

  /** Run until both pens stop (or a time limit). */
  settle(maxT = 6) {
    const t0 = this.t;
    while (this.t - t0 < maxT) {
      this.step();
      if (this.t - t0 > 0.05 && this.settled()) break;
    }
    for (const p of this.pens) if (!p.out) { p.vx = 0; p.vy = 0; p.w = 0; }
  }

  /** Grab point (−0.5 … 0.5 along pen i) for a desk point, or null if too far from the pen. `slack` in cm. */
  grabAt(i: number, x: number, y: number, slack = 2.6): number | null {
    const p = this.pens[i];
    if (p.out) return null;
    const dx = x - p.x, dy = y - p.y;
    const along = dx * Math.cos(p.a) + dy * Math.sin(p.a);
    const across = -dx * Math.sin(p.a) + dy * Math.cos(p.a);
    if (Math.abs(along) > p.spec.len / 2 + slack || Math.abs(across) > p.spec.r + slack) return null;
    return Math.max(-0.5, Math.min(0.5, along / p.spec.len));
  }

  /** A point along pen i (t from −0.5 to 0.5). */
  pointOn(i: number, t: number): [number, number] {
    const p = this.pens[i];
    return [p.x + Math.cos(p.a) * t * p.spec.len, p.y + Math.sin(p.a) * t * p.spec.len];
  }
}

/** Sliding friction summed over points along the pen. */
function friction(p: PenBody, dt: number) {
  const s = p.spec;
  const I = inertia(s);
  const c = Math.cos(p.a), sn = Math.sin(p.a);
  const fk = (s.mu * s.mass * G) / SAMPLES;
  let fx = 0, fy = 0, tq = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const d = ((k + 0.5) / SAMPLES - 0.5) * s.len;
    const rx = c * d, ry = sn * d;
    const vx = p.vx - p.w * ry, vy = p.vy + p.w * rx;
    const sp = Math.hypot(vx, vy);
    const k2 = fk / Math.max(sp, REG);
    const ex = -vx * k2, ey = -vy * k2;
    fx += ex; fy += ey;
    tq += rx * ey - ry * ex;
  }
  p.vx += (fx / s.mass) * dt;
  p.vy += (fy / s.mass) * dt;
  p.w += (tq / I) * dt;
  if (Math.hypot(p.vx, p.vy) < 0.25 && Math.abs(p.w) < 0.04) { p.vx = 0; p.vy = 0; p.w = 0; }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Closest points between segments p1–q1 and p2–q2. */
function closest(p1x: number, p1y: number, q1x: number, q1y: number, p2x: number, p2y: number, q2x: number, q2y: number): [number, number, number, number] {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  const c = d1x * rx + d1y * ry, b = d1x * d2x + d1y * d2y;
  const den = a * e - b * b;
  let s: number;
  if (den > 1e-3 * a * e) s = clamp01((b * f - c * e) / den);
  else {
    // (Nearly) parallel: take the middle of the part where they overlap, not an end.
    const s0 = ((p2x - p1x) * d1x + (p2y - p1y) * d1y) / a, s1 = ((q2x - p1x) * d1x + (q2y - p1y) * d1y) / a;
    const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(1, Math.max(s0, s1));
    s = lo <= hi ? (lo + hi) / 2 : clamp01(s0 < 0 && s1 < 0 ? 0 : 1);
  }
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
  return [p1x + d1x * s, p1y + d1y * s, p2x + d2x * t, p2y + d2y * t];
}

function ends(p: PenBody): [number, number, number, number] {
  const hx = (Math.cos(p.a) * p.spec.len) / 2, hy = (Math.sin(p.a) * p.spec.len) / 2;
  return [p.x - hx, p.y - hy, p.x + hx, p.y + hy];
}

/** Pen against pen: bounce with a little grip. Returns the impulse (0 if no contact). */
function collide(A: PenBody, B: PenBody): number {
  const [ax0, ay0, ax1, ay1] = ends(A), [bx0, by0, bx1, by1] = ends(B);
  const [cax, cay, cbx, cby] = closest(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1);
  let nx = cbx - cax, ny = cby - cay;
  const d = Math.hypot(nx, ny);
  const min = A.spec.r + B.spec.r;
  if (d >= min) return 0;
  if (d < 1e-6) { nx = -Math.sin(A.a); ny = Math.cos(A.a); } else { nx /= d; ny /= d; }
  const px = cax + nx * A.spec.r, py = cay + ny * A.spec.r;
  const IA = inertia(A.spec), IB = inertia(B.spec);
  const mA = A.spec.mass, mB = B.spec.mass;
  // Push apart (by mass).
  const over = min - d;
  const kA = mB / (mA + mB), kB = mA / (mA + mB);
  A.x -= nx * over * kA; A.y -= ny * over * kA;
  B.x += nx * over * kB; B.y += ny * over * kB;
  const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
  const vax = A.vx - A.w * ray, vay = A.vy + A.w * rax;
  const vbx = B.vx - B.w * rby, vby = B.vy + B.w * rbx;
  const rvx = vbx - vax, rvy = vby - vay;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const raN = rax * ny - ray * nx, rbN = rbx * ny - rby * nx;
  const kn = 1 / mA + 1 / mB + (raN * raN) / IA + (rbN * rbN) / IB;
  const jn = (-(1 + PEN_E) * vn) / kn;
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const raT = rax * ty - ray * tx, rbT = rbx * ty - rby * tx;
  const kt = 1 / mA + 1 / mB + (raT * raT) / IA + (rbT * rbT) / IB;
  const jt = Math.max(-PEN_MU * jn, Math.min(PEN_MU * jn, -vt / kt));
  const jx = nx * jn + tx * jt, jy = ny * jn + ty * jt;
  A.vx -= jx / mA; A.vy -= jy / mA; A.w -= (rax * jy - ray * jx) / IA;
  B.vx += jx / mB; B.vy += jy / mB; B.w += (rbx * jy - rby * jx) / IB;
  return jn;
}

/** How far a pen's centre is from the nearest edge (cm). */
export function edgeDistance(p: PenPose): number {
  return Math.min(DESK.w / 2 - Math.abs(p.x), DESK.d / 2 - Math.abs(p.y));
}

/** Starting places: each pen on its own half, turned a little, mirrored so it is fair. */
export function startPoses(rng?: Rng): PenPose[] {
  const j = rng ? rng.range(-0.25, 0.25) : 0;
  const yo = rng ? rng.range(-3, 3) : 0;
  return [
    { x: -13, y: 2.5 + yo, a: Math.PI / 2 - 0.35 + j },
    { x: 13, y: -2.5 - yo, a: -Math.PI / 2 - 0.35 + j },
  ];
}

// ---------- Computer opponent ----------

export interface SimResult { out: boolean[]; poses: PenPose[] }

export function simulate(world: PenWorld, who: number, f: Flick): SimResult {
  const w = world.clone();
  w.flick(who, f);
  w.settle();
  return { out: w.out, poses: [w.pose(0), w.pose(1)] };
}

export function scoreOutcome(who: number, r: SimResult): number {
  const opp = 1 - who;
  if (r.out[who]) return -1000 + (r.out[opp] ? 200 : 0);
  let s = 0;
  if (r.out[opp]) s += 1000;
  else s -= edgeDistance(r.poses[opp]) * 6;
  s += Math.min(14, edgeDistance(r.poses[who])) * 5;
  return s;
}

/** Flicks to try: grab points along the pen, directions at the other pen's middle and ends, several powers. */
export function candidates(world: PenWorld, who: number): Flick[] {
  const op = world.pens[1 - who];
  const list: Flick[] = [];
  for (const t of [-0.35, -0.15, 0, 0.15, 0.35]) {
    const [gx, gy] = world.pointOn(who, t);
    for (const ot of [-0.3, 0, 0.3]) {
      const tx = op.x + Math.cos(op.a) * ot * op.spec.len, ty = op.y + Math.sin(op.a) * ot * op.spec.len;
      const base = Math.atan2(ty - gy, tx - gx);
      for (const da of [-0.12, 0, 0.12]) for (const power of [0.4, 0.62, 0.82, 1]) list.push({ t, dir: base + da, power });
    }
  }
  return list;
}

/** The computer plans over several frames so the game does not stutter. */
export class PenAI {
  private queue: Flick[] = [];
  private results: Array<{ f: Flick; s: number }> = [];
  private world: PenWorld | null = null;
  constructor(private who: number, private diff: 'easy' | 'medium' | 'hard', private rng: Rng) {}
  start(world: PenWorld) {
    this.world = world.clone();
    this.queue = candidates(this.world, this.who);
    this.results = [];
  }
  /** Work a little. Returns the chosen flick when planning is complete. */
  work(budget = 12): Flick | null {
    if (!this.world) return null;
    for (let i = 0; i < budget && this.queue.length; i++) {
      const f = this.queue.pop()!;
      this.results.push({ f, s: scoreOutcome(this.who, simulate(this.world, this.who, f)) });
    }
    if (this.queue.length) return null;
    this.results.sort((a, b) => b.s - a.s);
    const pickFrom = this.diff === 'easy' ? Math.ceil(this.results.length * 0.35) : this.diff === 'medium' ? 5 : 1;
    const chosen = this.results[this.rng.int(0, Math.max(0, pickFrom - 1))].f;
    const noise = this.diff === 'easy' ? 0.1 : this.diff === 'medium' ? 0.05 : 0.015;
    return { t: chosen.t, dir: chosen.dir + this.rng.gauss() * noise, power: Math.max(0.2, Math.min(1, chosen.power + this.rng.gauss() * noise * 1.5)) };
  }
}
