import type { Rng } from '../../engine/rng';

// Street cricket engine (pure, metres and seconds).
// One engine, four venues. A venue is data: pitch length, bowler pace,
// field shape, scoring zones and local rules (six = out, off the roof,
// into a house, one-tip-one-hand).
//
// Coordinates on the field: x = sideways (+ = off side), y = forward from
// the batter (toward the bowler), h = height. The batter stands at (0, 0).

export type VenueId = 'short-pitch' | 'tape-tennis' | 'rooftop' | 'goli';

export interface Venue {
  id: VenueId;
  pitch: number;                 // metres from the bowler's release to the batter
  speed: [number, number];       // bowler pace range (m/s)
  swing: number;                 // max sideways swing (m)
  bounce: number;                // vertical restitution at the bounce
  shape: 'circle' | 'rect';
  radius: number;                // circle boundary
  halfW: number;                 // rect half width
  len: number;                   // rect forward length
  zones: [number, number, number]; // distance thresholds for 1, 2, 3 runs
  zoneBy: 'radius' | 'forward';
  walls: boolean;                // side walls that the ball bounces off
  wallH: number;                 // a ball above this when it crosses a side wall goes into a house
  overWall: 'out' | 'none';
  fullBoundary: 'out' | 'six';   // over the far boundary on the full
  oneTip: boolean;               // caught after one bounce is out
  tank?: { x: number; y: number; r: number }; // rooftop water tank: hit = 2 runs
  power: number;                 // shot power scale for the size of the venue
  catchK: number;                // how easy catches are here (1 = normal)
  roll: number;                  // rolling friction (m/s²)
  fielders: Array<[number, number]>;
}

export const VENUES: Record<VenueId, Venue> = {
  'short-pitch': { id: 'short-pitch', pitch: 14, speed: [14, 22], swing: 0.15, bounce: 0.62, shape: 'circle', radius: 26, halfW: 26, len: 26, zones: [8, 14, 20], zoneBy: 'radius', walls: false, wallH: 99, overWall: 'none', fullBoundary: 'out', oneTip: false, power: 0.95, catchK: 1, roll: 6, fielders: [[-8, 12], [8, 12], [0, 20], [-15, 6], [15, 6], [-3, -3]] },
  'tape-tennis': { id: 'tape-tennis', pitch: 18, speed: [18, 28], swing: 0.45, bounce: 0.72, shape: 'rect', radius: 99, halfW: 7, len: 44, zones: [10, 20, 30], zoneBy: 'forward', walls: true, wallH: 99, overWall: 'none', fullBoundary: 'six', oneTip: false, power: 1.15, catchK: 0.85, roll: 5, fielders: [[-4, 12], [4, 14], [0, 26], [-4, 34], [4, 38], [0, -3]] },
  rooftop: { id: 'rooftop', pitch: 12, speed: [12, 20], swing: 0.2, bounce: 0.6, shape: 'rect', radius: 99, halfW: 8, len: 22, zones: [6, 12, 17], zoneBy: 'forward', walls: true, wallH: 0.9, overWall: 'out', fullBoundary: 'out', oneTip: false, tank: { x: 4.5, y: 15, r: 1.3 }, power: 0.72, catchK: 0.9, roll: 6.5, fielders: [[-5, 8], [5, 7], [0, 15], [-5, 18], [0, -2.5]] },
  goli: { id: 'goli', pitch: 15, speed: [14, 22], swing: 0.25, bounce: 0.65, shape: 'rect', radius: 99, halfW: 3, len: 32, zones: [7, 14, 21], zoneBy: 'forward', walls: true, wallH: 3.2, overWall: 'out', fullBoundary: 'out', oneTip: true, power: 0.85, catchK: 0.6, roll: 6, fielders: [[-1.5, 9], [1.5, 15], [0, 24], [0, -2.5]] },
};

export const G = 9.8;
const RELEASE_H = 2.0;
export const STUMP_HALF = 0.12;
export const STUMP_H = 0.71;

// ---------- Delivery ----------

export interface Delivery { speed: number; length: number; line: number; swing: number; release: number }

export function deliveryTime(v: Venue, d: Delivery): number {
  return v.pitch / d.speed;
}

/** Ball position during the delivery: z = distance from the batter, x sideways, h height. */
export function ballAt(v: Venue, d: Delivery, t: number): { z: number; x: number; h: number } {
  const T = deliveryTime(v, d);
  const s = Math.min(1.15, t / T);
  const z = v.pitch * (1 - s);
  const tb = (v.pitch - d.length) / d.speed;
  const v0 = (G * tb * tb / 2 - RELEASE_H) / tb;
  let h: number;
  if (t <= tb) h = RELEASE_H + v0 * t - (G * t * t) / 2;
  else {
    const up = -(v0 - G * tb) * v.bounce;
    const u = t - tb;
    h = Math.max(0, up * u - (G * u * u) / 2);
  }
  const x = d.release + (d.line - d.release) * s + d.swing * s * s;
  return { z, x, h };
}

export function hitsStumps(v: Venue, d: Delivery): boolean {
  const p = ballAt(v, d, deliveryTime(v, d));
  return Math.abs(p.x) < STUMP_HALF + 0.035 && p.h < STUMP_H;
}

export type Length = 'full' | 'good' | 'short';
export type Line = 'leg' | 'middle' | 'off';

export function makeDelivery(v: Venue, length: Length, line: Line, fast: boolean, rng: Rng, accuracy = 1): Delivery {
  const L = { full: 1.2, good: v.pitch * 0.3, short: v.pitch * 0.55 }[length];
  const X = { leg: -0.28, middle: 0, off: 0.3 }[line];
  const sp = fast ? v.speed[1] : (v.speed[0] + v.speed[1]) / 2 - 2;
  const err = (1.2 - accuracy) * 0.5;
  return {
    speed: sp * (0.95 + rng.next() * 0.1),
    length: Math.max(0.4, L + rng.gauss() * err * 2),
    line: X + rng.gauss() * err * 0.3,
    swing: rng.range(-1, 1) * v.swing,
    release: rng.range(-0.3, 0.3),
  };
}

// ---------- Batting ----------

export type Shot = 'drive' | 'loft' | 'defend' | 'none';
export type Contact = 'clean' | 'edge' | 'miss';

export const WINDOW = { clean: 0.15, edge: 0.22, defend: 0.2 };

export function judgeSwing(shot: Shot, dt: number): { contact: Contact; quality: number } {
  if (shot === 'none') return { contact: 'miss', quality: 0 };
  const a = Math.abs(dt);
  const clean = shot === 'defend' ? WINDOW.defend : WINDOW.clean;
  if (a <= clean) return { contact: 'clean', quality: 1 - a / clean };
  if (a <= WINDOW.edge + (shot === 'defend' ? 0.04 : 0)) return { contact: 'edge', quality: 0.2 };
  return { contact: 'miss', quality: 0 };
}

export interface Launch { v: number; elev: number; dir: number }

/**
 * How the ball leaves the bat. Early = leg side (−), late = off side (+).
 * A drive stays low unless it is mistimed or the ball bounces high; a loft goes up.
 */
export function launchFor(shot: Shot, contact: Contact, quality: number, dt: number, v: Venue, d: Delivery, rng: Rng): Launch {
  const hT = ballAt(v, d, deliveryTime(v, d)).h;
  if (contact === 'edge') return { v: rng.range(5, 10) * v.power, elev: rng.range(0.15, 0.55), dir: (rng.chance(0.5) ? 1 : -1) * rng.range(1.9, 2.7) };
  if (shot === 'defend') return { v: rng.range(3, 6.5), elev: rng.range(0, 0.06), dir: rng.range(-0.7, 0.7) + d.line * 0.5 };
  const dir = Math.max(-1.45, Math.min(1.45, (dt / WINDOW.clean) * 1.1 + d.line * 0.8 + rng.gauss() * 0.14));
  const speed = (10 + 14 * quality + d.speed * 0.2 + rng.range(-1.5, 1.5)) * v.power;
  const elev = shot === 'loft'
    ? 0.32 + rng.range(0, 0.22) + (1 - quality) * 0.2
    : Math.max(0.015, 0.025 + (1 - quality) ** 2 * 0.32 + Math.min(1, hT / 1.2) * 0.06 + rng.gauss() * 0.025);
  return { v: speed, elev, dir };
}

// ---------- The shot on the field ----------

export type OutHow = 'bowled' | 'caught' | 'six-out' | 'off-roof' | 'house' | 'one-tip';
export interface BallResult {
  runs: number;
  out: OutHow | null;
  label: 'dot' | 'runs' | 'four' | 'six' | 'tank' | OutHow;
  frames: Array<[number, number, number]>;   // ball x, y, h every 1/60 s
  fielders: Array<Array<[number, number]>>;  // each fielder's x, y per frame
  catcher: number | null;
}

function zoneOf(v: Venue, x: number, y: number): number {
  const d = v.zoneBy === 'radius' ? Math.hypot(x, y) : Math.max(y, Math.abs(y) * 0.5);
  return v.zones.filter((z) => d >= z).length;
}

/** Simulate the ball after it leaves the bat. Deterministic for a given rng state. */
export function simulateShot(v: Venue, l: Launch, rng: Rng, catchSkill = 0.8): BallResult {
  const dt = 1 / 120;
  const b = { x: 0, y: 0.4, h: 0.8, vx: l.v * Math.cos(l.elev) * Math.sin(l.dir), vy: l.v * Math.cos(l.elev) * Math.cos(l.dir), vh: l.v * Math.sin(l.elev), bounces: 0, wallTip: false };
  const fs = v.fielders.map(([x, y]) => ({ x, y, stun: 0.25 + rng.range(0, 0.15) }));
  const frames: BallResult['frames'] = [];
  const fpath: BallResult['fielders'] = fs.map(() => []);
  let maxZone = 0;
  let res: Pick<BallResult, 'runs' | 'out' | 'label' | 'catcher'> | null = null;
  const end = (runs: number, out: OutHow | null, label: BallResult['label'], catcher: number | null = null) => { res = { runs, out, label, catcher }; };
  for (let step = 0; step < 6 / dt && !res; step++) {
    // Ball
    const sp = Math.hypot(b.vx, b.vy, b.vh);
    const drag = 0.012 * sp;
    b.vx -= b.vx * drag * dt; b.vy -= b.vy * drag * dt; b.vh -= (b.vh * drag + G) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.h += b.vh * dt;
    if (b.h <= 0) {
      b.h = 0;
      if (Math.abs(b.vh) > 1.2) { b.vh = -b.vh * 0.5; b.vx *= 0.75; b.vy *= 0.75; b.bounces++; if (b.bounces > 1) b.wallTip = false; }
      else {
        b.vh = 0;
        const g = Math.hypot(b.vx, b.vy);
        const k = g > 0 ? Math.max(0, g - v.roll * dt) / g : 0;
        b.vx *= k; b.vy *= k;
        if (b.bounces === 0) b.bounces = 1;
      }
    }
    maxZone = Math.max(maxZone, zoneOf(v, b.x, b.y));
    const onFull = b.bounces === 0;
    // Obstacles and boundaries
    if (v.tank && Math.hypot(b.x - v.tank.x, b.y - v.tank.y) < v.tank.r && b.h < 2.2) { end(2, null, 'tank'); break; }
    if (v.shape === 'circle') {
      if (Math.hypot(b.x, b.y) >= v.radius) {
        if (onFull) { if (v.fullBoundary === 'out') end(0, 'six-out', 'six-out'); else end(6, null, 'six'); }
        else end(4, null, 'four');
        break;
      }
    } else {
      if (Math.abs(b.x) >= v.halfW) {
        if (v.overWall === 'out' && b.h > v.wallH) { end(0, v.id === 'rooftop' ? 'off-roof' : 'house', v.id === 'rooftop' ? 'off-roof' : 'house'); break; }
        b.x = Math.sign(b.x) * (v.halfW - 0.01);
        b.vx *= -0.55;
        if (b.bounces === 0) { b.bounces = 1; b.wallTip = true; } // the wall counts as a "tip"
      }
      if (b.y >= v.len) {
        if (onFull && b.h > (v.id === 'rooftop' ? v.wallH : 0.2)) {
          if (v.fullBoundary === 'out') end(0, v.id === 'rooftop' ? 'off-roof' : 'six-out', v.id === 'rooftop' ? 'off-roof' : 'six-out');
          else end(6, null, 'six');
        } else end(4, null, 'four');
        break;
      }
      if (v.id === 'rooftop' && b.y < -3 && b.h > v.wallH) { end(0, 'off-roof', 'off-roof'); break; }
    }
    // Fielders
    for (const [i, f] of fs.entries()) {
      if (f.stun > 0) { f.stun -= dt; continue; }
      // Run toward where the ball will be in a moment (a simple lead).
      const lead = Math.min(0.6, Math.hypot(b.x - f.x, b.y - f.y) / 12);
      const tx = b.x + b.vx * lead, ty = b.y + b.vy * lead;
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      const run = 6.5 * dt;
      if (d > run) { f.x += (dx / d) * run; f.y += (dy / d) * run; } else { f.x = tx; f.y = ty; }
      const near = Math.hypot(b.x - f.x, b.y - f.y);
      // One-tip-one-hand (alley rule): caught after exactly one bounce off a wall.
      const catchable = b.bounces === 0 || (v.oneTip && b.bounces === 1 && b.wallTip);
      if (near < 1.15 && b.h > 0.15 && b.h < 2.4 && catchable) {
        const hard = Math.min(1, Math.hypot(b.vx, b.vy) / 30);
        if (rng.chance(catchSkill * v.catchK * (1 - hard * 0.35))) { end(0, b.bounces === 0 ? 'caught' : 'one-tip', b.bounces === 0 ? 'caught' : 'one-tip', i); break; }
        f.stun = 0.6; b.vx *= 0.4; b.vy *= 0.4; b.vh = Math.abs(b.vh) * 0.3; // dropped!
      } else if (near < 0.9 && b.h < 0.6 && b.bounces > 0) {
        const r = Math.min(3, maxZone);
        end(r, null, r === 0 ? 'dot' : 'runs', null);
        break;
      }
    }
    if (step % 2 === 0) {
      frames.push([b.x, b.y, b.h]);
      fs.forEach((f, i) => fpath[i].push([f.x, f.y]));
    }
    if (!res && b.h === 0 && Math.hypot(b.vx, b.vy) < 0.3) { const r = Math.min(3, maxZone); end(r, null, r === 0 ? 'dot' : 'runs'); }
  }
  frames.push([b.x, b.y, b.h]);
  fs.forEach((f, i) => fpath[i].push([f.x, f.y]));
  const r = res ?? { runs: Math.min(3, maxZone), out: null, label: 'runs' as const, catcher: null };
  return { ...r, frames, fielders: fpath };
}

// ---------- Computer players ----------

export type Diff = 'easy' | 'medium' | 'hard';

/** Computer batter: chooses hit or defend, then presses with timing noise. */
export function aiBat(v: Venue, d: Delivery, diff: Diff, rng: Rng, need?: number): { shot: Shot; dt: number } {
  const sd = diff === 'easy' ? 0.1 : diff === 'medium' ? 0.07 : 0.045;
  const hT = ballAt(v, d, deliveryTime(v, d)).h;
  const risky = v.fullBoundary === 'out' || v.overWall === 'out';
  let loftP = risky ? (diff === 'easy' ? 0.15 : 0.05) : 0.3;
  let defendP = hT > 1 ? 0.3 : 0.15;
  if (need !== undefined && need > 6) { loftP += 0.15; defendP = 0.05; }
  if (need !== undefined && need <= 2) { loftP = 0; defendP = 0.4; }
  const r = rng.next();
  const shot: Shot = r < defendP ? 'defend' : r < defendP + loftP ? 'loft' : 'drive';
  void hT;
  return { shot, dt: rng.gauss() * sd };
}

/** Computer bowler: varies length and line. */
export function aiBowl(v: Venue, diff: Diff, rng: Rng): Delivery {
  const lengths: Length[] = ['full', 'good', 'good', 'short'];
  const lines: Line[] = ['leg', 'middle', 'middle', 'off'];
  const acc = diff === 'easy' ? 0.6 : diff === 'medium' ? 0.85 : 1.05;
  return makeDelivery(v, rng.pick(lengths), rng.pick(lines), rng.chance(diff === 'hard' ? 0.5 : 0.3), rng, acc);
}
