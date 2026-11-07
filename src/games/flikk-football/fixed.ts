import type { Rng } from '../../engine/rng';
import { MAX_SPEED, PITCH, R_BALL, R_DISC, R_KEEPER, ball, cloneWorld, flick, moving, settle, step, type Body, type Side, type World } from './physics';
import { FORMATIONS, type TeamSetup } from './match';

// Fixed mode ("table football" style): every player is pinned to a spot on the whole pitch,
// in the team's formation. Only the ball moves. The side with the ball flicks the ball itself
// from the player who has it; wherever it stops, the nearest player (keepers too) gets it.
// - Stops nearest one of yours: a completed pass, flick again.
// - Stops nearest one of theirs (or they block it): their ball.
// - Each flick is one step of the clock.
// Pure and deterministic like the free mode, so an online 1v1 only has to send
// { angle, power, spin } for each flick and both devices see the same result.

export type Style = 'free' | 'fixed';

/** The ball flicked straight leaves a little slower than a disc hit at full power would send it. */
export const BALL_POWER = 0.92;
/** Stops on the line between two players count as reached by the nearer one. */
const GAP = R_DISC * 2 + R_BALL * 2 + 10;

const MENT: Record<TeamSetup['mentality'], number> = { defend: 0.9, balanced: 1, attack: 1.07 };

/** A formation spot on the whole pitch: y = 0 at your own goal line, 1 just outside their box. */
export function fixedSpot(side: Side, fx: number, fy: number): [number, number] {
  const len = PITCH.bottom - PITCH.top;
  const x = PITCH.left + 30 + fx * (PITCH.right - PITCH.left - 60);
  const d = 64 + fy * (len - 64 - 190);
  return side === 0 ? [x, PITCH.bottom - d] : [PITCH.right - (x - PITCH.left), PITCH.top + d];
}

export function fixedShape(side: Side, t: TeamSetup): Array<[number, number]> {
  const k = MENT[t.mentality];
  return FORMATIONS[t.formation].map(([fx, fy]) => fixedSpot(side, fx, Math.min(1, fy * k)));
}

/** Push pinned players apart so the ball can always pass between two of them. `hold` never moves. */
function spread(w: World, hold: number | null) {
  const ds = w.bodies.filter((b) => b.kind === 'disc');
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      if (d >= GAP) continue;
      moved = true;
      const push = GAP - d;
      const ka = a.id === hold ? 0 : b.id === hold ? 1 : 0.5;
      const kb = 1 - ka;
      a.x -= (dx / d) * push * ka; a.y -= (dy / d) * push * ka;
      b.x += (dx / d) * push * kb; b.y += (dy / d) * push * kb;
    }
    for (const b of ds) {
      b.x = Math.max(PITCH.left + b.r + 6, Math.min(PITCH.right - b.r - 6, b.x));
      b.y = Math.max(PITCH.top + 70, Math.min(PITCH.bottom - 70, b.y));
    }
    if (!moved) break;
  }
}

/** Kick-off for fixed mode: both teams on their spots, the kicking side's nearest player on the ball. */
export function fixedKickoff(teams: [TeamSetup, TeamSetup], kicking: Side, keeperSpeed: [number, number]): { w: World; holder: number } {
  const bodies: Body[] = [];
  let id = 0;
  ([0, 1] as Side[]).forEach((s) => {
    fixedShape(s, teams[s]).forEach(([x, y]) => bodies.push({ id: id++, kind: 'disc', side: s, x, y, vx: 0, vy: 0, r: R_DISC, m: 1, spin: 0 }));
  });
  ([0, 1] as Side[]).forEach((s) => bodies.push({ id: id++, kind: 'keeper', side: s, x: 300, y: s === 0 ? PITCH.bottom - 24 : PITCH.top + 24, vx: 0, vy: 0, r: R_KEEPER, m: 1, spin: 0 }));
  bodies.push({ id: id++, kind: 'ball', side: -1, x: 300, y: PITCH.midY, vx: 0, vy: 0, r: R_BALL, m: 0.42, spin: 0 });
  const w: World = { bodies, keeperSpeed, touches: [], goal: null, t: 0, pinned: true };
  const mine = bodies.filter((b) => b.kind === 'disc' && b.side === kicking);
  const kicker = mine.reduce((a, b) => (Math.hypot(a.x - 300, a.y - PITCH.midY) < Math.hypot(b.x - 300, b.y - PITCH.midY) ? a : b));
  kicker.x = 300; kicker.y = PITCH.midY + (kicking === 0 ? 1 : -1) * (R_DISC + R_BALL + 2);
  // Keep the centre circle clear apart from the kicker.
  for (const b of bodies) {
    if (b.kind !== 'disc' || b === kicker) continue;
    const dx = b.x - 300, dy = b.y - PITCH.midY, d = Math.hypot(dx, dy) || 1;
    if (d < 80) { b.x = 300 + (dx / d) * 82; b.y = PITCH.midY + (dy / d) * 82; }
  }
  spread(w, kicker.id);
  const bl = ball(w);
  bl.x = 300; bl.y = PITCH.midY;
  return { w, holder: kicker.id };
}

/** Put the ball at the holder's feet, facing the goal they attack, in a gap that is free. */
export function placeBall(w: World, holderId: number) {
  const h = w.bodies.find((b) => b.id === holderId)!;
  const bl = ball(w);
  const s = h.side as Side;
  const goalY = s === 0 ? PITCH.top : PITCH.bottom;
  const base = Math.atan2(goalY - h.y, 300 - h.x);
  const reach = h.r + R_BALL + 1.5;
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI]) {
    const x = h.x + Math.cos(base + off) * reach, y = h.y + Math.sin(base + off) * reach;
    if (x < PITCH.left + R_BALL || x > PITCH.right - R_BALL || y < PITCH.top + R_BALL || y > PITCH.bottom - R_BALL) continue;
    if (w.bodies.some((o) => o !== bl && o !== h && Math.hypot(o.x - x, o.y - y) < o.r + R_BALL + 1)) continue;
    bl.x = x; bl.y = y; bl.vx = 0; bl.vy = 0; bl.spin = 0;
    return;
  }
  bl.x = h.x + Math.cos(base) * reach; bl.y = h.y + Math.sin(base) * reach;
  bl.vx = 0; bl.vy = 0; bl.spin = 0;
}

/** Who reaches the ball where it stopped: the nearest player or keeper. */
export function receiver(w: World): Body {
  const bl = ball(w);
  let best: Body | null = null, bd = Infinity;
  for (const b of w.bodies) {
    if (b.kind === 'ball') continue;
    const d = Math.hypot(b.x - bl.x, b.y - bl.y) - b.r;
    if (d < bd) { bd = d; best = b; }
  }
  return best!;
}

export interface FixedResult { goal: Side | null; holder: number; keep: boolean; pass: boolean }

export function judgeFixed(w: World, side: Side, prevHolder: number): FixedResult {
  const r = receiver(w);
  const keep = w.goal === null && r.side === side;
  return { goal: w.goal, holder: r.id, keep, pass: keep && r.id !== prevHolder };
}

export function flickBall(w: World, angle: number, power: number, spin = 0) {
  flick(w, ball(w).id, angle, Math.max(0, Math.min(1, power)) * BALL_POWER, spin);
}

/** How far a ball rolls from speed v (px/s), from the ball's friction in physics.ts. */
export function ballReach(v: number): number {
  const c = 210 / 0.55;
  return (v - c * Math.log(1 + v / c)) / 0.55;
}

/** Flick power (0..1) that rolls the ball about `dist` px. */
export function powerFor(dist: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (ballReach(m * BALL_POWER * MAX_SPEED) < dist) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

export interface Preview {
  /** Ball positions along the way (pitch units). */
  path: Array<[number, number]>;
  /** 'touch': it meets a player first; 'rest': it stops in space; 'goal': it goes in. */
  end: 'touch' | 'rest' | 'goal';
  /** The player it meets ('touch') or who reaches it ('rest'). */
  who: Body | null;
}

/** The guide: run the real physics on a copy (only the ball moves, so it is cheap) up to the first player it meets. */
export function previewFixed(w: World, holder: number, angle: number, power: number, spin = 0): Preview {
  const sim = cloneWorld(w);
  flickBall(sim, angle, power, spin);
  const bl = ball(sim);
  const path: Array<[number, number]> = [[bl.x, bl.y]];
  for (let i = 0; i < 720; i++) {
    step(sim);
    if (i % 3 === 0) path.push([bl.x, bl.y]);
    if (sim.goal !== null) { path.push([bl.x, bl.y]); return { path, end: 'goal', who: null }; }
    const hit = sim.touches.find((id) => id !== holder);
    if (hit !== undefined) { path.push([bl.x, bl.y]); return { path, end: 'touch', who: sim.bodies.find((b) => b.id === hit) ?? null }; }
    if (!moving(sim)) break;
  }
  path.push([bl.x, bl.y]);
  return { path, end: 'rest', who: receiver(sim) };
}

// ---------- Computer opponent ----------

export interface FixedMove { angle: number; power: number; score: number }

/** Try passes to every team-mate, shots at the goal and a fan of other flicks; keep the best. */
export function aiChooseFixed(w: World, side: Side, holder: number, skill: number, rng: Rng): FixedMove {
  const bl = ball(w);
  const goalY = side === 0 ? PITCH.top - 12 : PITCH.bottom + 12;
  const cands: FixedMove[] = [];
  const add = (angle: number, power: number) => cands.push({ angle, power: Math.max(0.12, Math.min(1, power)), score: 0 });
  for (const tx of [PITCH.mouthL + 16, 300, PITCH.mouthR - 16]) {
    const a = Math.atan2(goalY - bl.y, tx - bl.x);
    for (const p of [0.85, 1]) add(a, p);
  }
  for (const m of w.bodies) {
    if (m.kind !== 'disc' || m.side !== side || m.id === holder) continue;
    const d = Math.hypot(m.x - bl.x, m.y - bl.y);
    if (d > 520) continue;
    const a = Math.atan2(m.y - bl.y, m.x - bl.x);
    const p = powerFor(Math.max(10, d - m.r - 6));
    add(a, p); add(a, p * 1.12);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const p of [0.4, 0.7]) add(a, p);
  }
  for (const c of cands) {
    const sim = cloneWorld(w);
    flickBall(sim, c.angle, c.power);
    settle(sim, 4.5);
    c.score = evaluateFixed(sim, side, holder);
  }
  cands.sort((a, b) => b.score - a.score);
  const pickIdx = skill > 0.85 ? 0 : rng.int(0, Math.min(cands.length - 1, skill > 0.55 ? 1 : 3));
  const best = cands[pickIdx];
  const err = (1 - skill) * 0.09;
  return { ...best, angle: best.angle + rng.gauss() * err, power: Math.max(0.12, Math.min(1, best.power + rng.gauss() * err * 0.8)) };
}

function evaluateFixed(w: World, side: Side, holder: number): number {
  if (w.goal === side) return 10000;
  if (w.goal !== null) return -20000;
  // The ball goes to whoever reaches it, so judge by where that player stands.
  const r = receiver(w);
  const progress = side === 1 ? r.y - PITCH.top : PITCH.bottom - r.y; // 0 = own goal line
  const ownGoalDist = Math.hypot(r.x - 300, r.y - (side === 1 ? PITCH.top : PITCH.bottom));
  if (r.side === side) {
    let s = 500 + progress * 1.6;
    // A player close to their goal is worth more.
    const theirGoal = Math.hypot(r.x - 300, r.y - (side === 1 ? PITCH.bottom : PITCH.top));
    if (theirGoal < 320) s += (320 - theirGoal) * 1.2;
    if (r.kind === 'keeper') s -= 150;
    if (r.id === holder) s -= 220; // the ball came back: a wasted flick
    return s;
  }
  let s = -500 + progress * 0.8;
  if (ownGoalDist < 320) s -= (320 - ownGoalDist) * 3;
  return s;
}
