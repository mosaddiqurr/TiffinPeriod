// Flikk Football physics: a top-down desk pitch with flat round pieces.
// Pure and deterministic (fixed step), so the computer can simulate candidate flicks
// and two devices online would see the same result from the same flick.

export const PITCH = { W: 600, H: 960, left: 40, right: 560, top: 60, bottom: 900, mouthL: 232, mouthR: 368, depth: 34, midY: 480 };
export const R_DISC = 17;
export const R_BALL = 10.5;
export const R_KEEPER = 19;
export const MAX_SPEED = 1350;
const POST_R = 4;

export type Side = 0 | 1;

export interface Body {
  id: number;
  kind: 'disc' | 'ball' | 'keeper';
  side: Side | -1;
  x: number; y: number; vx: number; vy: number;
  r: number; m: number;
  spin: number;
}

export interface World {
  bodies: Body[];
  /** Kinematic keeper speed per side (px/s). */
  keeperSpeed: [number, number];
  /** Contacts with the ball in order: body ids. */
  touches: number[];
  goal: Side | null;
  t: number;
  /** Fixed mode: the players are pinned to their spots and only the ball moves. */
  pinned?: boolean;
}

export const ball = (w: World) => w.bodies.find((b) => b.kind === 'ball')!;
export const keeperOf = (w: World, s: Side) => w.bodies.find((b) => b.kind === 'keeper' && b.side === s)!;
export const discsOf = (w: World, s: Side) => w.bodies.filter((b) => b.kind === 'disc' && b.side === s);

/** y of the goal line a side defends. Side 0 defends the bottom and attacks up. */
export const ownLine = (s: Side) => (s === 0 ? PITCH.bottom : PITCH.top);
const keeperY = (s: Side) => (s === 0 ? PITCH.bottom - 24 : PITCH.top + 24);

export function cloneWorld(w: World): World {
  return { bodies: w.bodies.map((b) => ({ ...b })), keeperSpeed: [...w.keeperSpeed] as [number, number], touches: [...w.touches], goal: w.goal, t: w.t, pinned: w.pinned };
}

export function moving(w: World): boolean {
  return w.bodies.some((b) => b.kind !== 'keeper' && (b.vx !== 0 || b.vy !== 0));
}

export function flick(w: World, id: number, angle: number, power: number, spin = 0) {
  const b = w.bodies.find((x) => x.id === id);
  if (!b) return;
  const s = Math.max(0, Math.min(1, power)) * MAX_SPEED;
  b.vx = Math.cos(angle) * s;
  b.vy = Math.sin(angle) * s;
  b.spin = Math.max(-1, Math.min(1, spin));
  w.touches = [];
  w.goal = null;
}

function friction(b: Body, dt: number) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp === 0) return;
  if (b.spin !== 0) {
    // Curl: a sideways push that fades.
    const a = b.spin * sp * 0.62 * dt;
    const ux = -b.vy / sp, uy = b.vx / sp;
    b.vx += ux * a;
    b.vy += uy * a;
    b.spin *= Math.exp(-2.2 * dt);
    if (Math.abs(b.spin) < 0.01) b.spin = 0;
  }
  const mu = b.kind === 'ball' ? 210 : 330; // rolling friction (px/s²)
  const drag = b.kind === 'ball' ? 0.55 : 0.9;
  const dec = (mu + drag * sp) * dt;
  const ns = Math.max(0, sp - dec);
  if (ns < 6) { b.vx = 0; b.vy = 0; b.spin = 0; return; }
  b.vx *= ns / sp; b.vy *= ns / sp;
}

function walls(b: Body) {
  const P = PITCH;
  const e = b.kind === 'ball' ? 0.72 : 0.55;
  if (b.x < P.left + b.r) { b.x = P.left + b.r; b.vx = Math.abs(b.vx) * e; }
  if (b.x > P.right - b.r) { b.x = P.right - b.r; b.vx = -Math.abs(b.vx) * e; }
  const inMouth = b.x - b.r > P.mouthL && b.x + b.r < P.mouthR;
  // Top end
  if (b.y < P.top + b.r) {
    if (inMouth || b.y < P.top) {
      // Inside the net: side walls and the back of the net.
      if (b.y < P.top) {
        if (b.x < P.mouthL + b.r) { b.x = P.mouthL + b.r; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x > P.mouthR - b.r) { b.x = P.mouthR - b.r; b.vx = -Math.abs(b.vx) * 0.3; }
      }
      if (b.y < P.top - P.depth + b.r) { b.y = P.top - P.depth + b.r; b.vy = Math.abs(b.vy) * 0.2; }
    } else { b.y = P.top + b.r; b.vy = Math.abs(b.vy) * e; }
  }
  // Bottom end
  if (b.y > P.bottom - b.r) {
    if (inMouth || b.y > P.bottom) {
      if (b.y > P.bottom) {
        if (b.x < P.mouthL + b.r) { b.x = P.mouthL + b.r; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x > P.mouthR - b.r) { b.x = P.mouthR - b.r; b.vx = -Math.abs(b.vx) * 0.3; }
      }
      if (b.y > P.bottom + P.depth - b.r) { b.y = P.bottom + P.depth - b.r; b.vy = -Math.abs(b.vy) * 0.2; }
    } else { b.y = P.bottom - b.r; b.vy = -Math.abs(b.vy) * e; }
  }
  // Posts
  for (const px of [P.mouthL, P.mouthR]) for (const py of [P.top, P.bottom]) {
    const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = b.r + POST_R;
    if (d < min && d > 0) {
      const nx = dx / d, ny = dy / d;
      b.x = px + nx * min; b.y = py + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
    }
  }
}

function collide(w: World, a: Body, b: Body) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  const fixed = (x: Body) => x.kind === 'keeper' || (!!w.pinned && x.kind === 'disc');
  const ka = fixed(a) ? 0 : 1 / a.m;
  const kb = fixed(b) ? 0 : 1 / b.m;
  if (ka + kb === 0) return;
  // Separate
  const over = min - d;
  a.x -= nx * over * (ka / (ka + kb)); a.y -= ny * over * (ka / (ka + kb));
  b.x += nx * over * (kb / (ka + kb)); b.y += ny * over * (kb / (ka + kb));
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const e = a.kind === 'ball' || b.kind === 'ball' ? 0.86 : 0.7;
    const j = (-(1 + e) * rv) / (ka + kb);
    a.vx -= j * nx * ka; a.vy -= j * ny * ka;
    b.vx += j * nx * kb; b.vy += j * ny * kb;
    if (a.kind === 'ball' || b.kind === 'ball') {
      const other = a.kind === 'ball' ? b : a;
      const bl = a.kind === 'ball' ? a : b;
      if (w.touches[w.touches.length - 1] !== other.id) w.touches.push(other.id);
      if (other.kind === 'disc' && other.spin) bl.spin = other.spin * 0.7;
    }
  }
}

function moveKeeper(w: World, k: Body, dt: number) {
  const s = k.side as Side;
  const bl = ball(w);
  const ky = keeperY(s);
  let tx = bl.x;
  const toward = s === 0 ? bl.vy > 0 : bl.vy < 0;
  if (toward && Math.abs(bl.vy) > 30) {
    const tt = (ky - bl.y) / bl.vy;
    if (tt > 0 && tt < 2.5) tx = bl.x + bl.vx * tt;
  }
  tx = Math.max(PITCH.mouthL - 6, Math.min(PITCH.mouthR + 6, tx));
  const dx = tx - k.x;
  const sp = w.keeperSpeed[s];
  const step = Math.max(-sp * dt, Math.min(sp * dt, dx));
  k.vx = step / dt; k.vy = 0;
  k.x += step; k.y = ky;
}

/** One fixed step (dt = 1/120 s), split into two collision sub-steps. */
export function step(w: World, dt = 1 / 120) {
  const sub = 2, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of w.bodies) {
      if (b.kind === 'keeper') { moveKeeper(w, b, h); continue; }
      if (w.pinned && b.kind === 'disc') continue;
      friction(b, h);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED * 1.2) { b.vx *= (MAX_SPEED * 1.2) / sp; b.vy *= (MAX_SPEED * 1.2) / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
    }
    const n = w.bodies.length;
    if (w.pinned) {
      // Only the ball moves: check it against everything else.
      const bl = w.bodies.find((b) => b.kind === 'ball')!;
      for (const o of w.bodies) if (o !== bl) collide(w, bl, o);
    } else {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) collide(w, w.bodies[i], w.bodies[j]);
    }
    for (const b of w.bodies) if (b.kind !== 'keeper' && !(w.pinned && b.kind === 'disc')) walls(b);
  }
  w.t += dt;
  const bl = ball(w);
  if (w.goal === null && bl.x > PITCH.mouthL && bl.x < PITCH.mouthR) {
    if (bl.y < PITCH.top - 2) w.goal = 0; // side 0 scored at the top
    else if (bl.y > PITCH.bottom + 2) w.goal = 1;
  }
}

/** Run until everything stops (or a limit). Returns the time it took. */
export function settle(w: World, maxT = 7, stopOnGoal = true): number {
  const t0 = w.t;
  while (w.t - t0 < maxT) {
    step(w);
    if (stopOnGoal && w.goal !== null) break;
    if (!moving(w)) break;
  }
  return w.t - t0;
}

export function stopAll(w: World) {
  for (const b of w.bodies) { b.vx = 0; b.vy = 0; b.spin = 0; }
}
