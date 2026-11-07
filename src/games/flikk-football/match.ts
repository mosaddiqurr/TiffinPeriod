import type { Rng } from '../../engine/rng';
import { PITCH, R_BALL, R_DISC, R_KEEPER, ball, cloneWorld, discsOf, flick, settle, type Body, type Side, type World } from './physics';

// Match rules for Flikk Football (pure data, no drawing).
// - Teams take turns. A turn is up to 3 flicks of your own pieces.
// - You keep the turn while your flick touches the ball and the ball ends nearest to one of
//   your pieces (a completed pass). Miss the ball, or lose it, and the turn passes.
// - The goalkeepers slide along their lines by themselves.
// - The clock moves one step per turn; at half time and after a goal, the shapes reset.
// - "Regroup" (once per half): put your pieces back into your formation instead of flicking.

export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '4-2-3-1' | '5-3-2';
export type Mentality = 'defend' | 'balanced' | 'attack';

/** Outfield spots as (x across 0..1, y from own goal 0 to halfway 1). */
export const FORMATIONS: Record<FormationId, Array<[number, number]>> = {
  '4-4-2': [[0.14, 0.24], [0.38, 0.18], [0.62, 0.18], [0.86, 0.24], [0.13, 0.54], [0.38, 0.48], [0.62, 0.48], [0.87, 0.54], [0.36, 0.86], [0.64, 0.86]],
  '4-3-3': [[0.14, 0.24], [0.38, 0.18], [0.62, 0.18], [0.86, 0.24], [0.27, 0.5], [0.5, 0.44], [0.73, 0.5], [0.16, 0.82], [0.5, 0.9], [0.84, 0.82]],
  '3-5-2': [[0.25, 0.2], [0.5, 0.16], [0.75, 0.2], [0.09, 0.52], [0.3, 0.46], [0.5, 0.4], [0.7, 0.46], [0.91, 0.52], [0.36, 0.86], [0.64, 0.86]],
  '4-2-3-1': [[0.14, 0.24], [0.38, 0.18], [0.62, 0.18], [0.86, 0.24], [0.38, 0.4], [0.62, 0.4], [0.16, 0.66], [0.5, 0.64], [0.84, 0.66], [0.5, 0.9]],
  '5-3-2': [[0.07, 0.3], [0.28, 0.2], [0.5, 0.16], [0.72, 0.2], [0.93, 0.3], [0.28, 0.52], [0.5, 0.48], [0.72, 0.52], [0.36, 0.86], [0.64, 0.86]],
};
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

const MENT: Record<Mentality, number> = { defend: 0.86, balanced: 1, attack: 1.1 };

export interface TeamSetup { formation: FormationId; mentality: Mentality }

export function spot(side: Side, fx: number, fy: number): [number, number] {
  const half = PITCH.bottom - PITCH.midY - 10;
  const x = PITCH.left + 26 + fx * (PITCH.right - PITCH.left - 52);
  return side === 0 ? [x, PITCH.bottom - 16 - fy * half] : [PITCH.right - (x - PITCH.left), PITCH.top + 16 + fy * half];
}

export function shapeOf(side: Side, t: TeamSetup): Array<[number, number]> {
  const k = MENT[t.mentality];
  return FORMATIONS[t.formation].map(([fx, fy]) => spot(side, fx, Math.min(0.94, fy * k)));
}

/** Pieces of a side back to their formation spots (keeps ids). */
export function regroup(w: World, side: Side, t: TeamSetup) {
  const pts = shapeOf(side, t);
  discsOf(w, side).forEach((d, i) => { d.x = pts[i][0]; d.y = pts[i][1]; d.vx = 0; d.vy = 0; d.spin = 0; });
  separate(w);
}

/** Nudge overlapping pieces apart, and keep them inside the pitch. */
export function separate(w: World) {
  for (let it = 0; it < 12; it++) {
    for (const a of w.bodies) for (const b of w.bodies) {
      if (a === b || a.kind === 'keeper' || b.kind === 'keeper') continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 2;
      if (d < min) { const k = (min - d) / 2; a.x -= (dx / d) * k; a.y -= (dy / d) * k; b.x += (dx / d) * k; b.y += (dy / d) * k; }
    }
    for (const b of w.bodies) {
      b.x = Math.max(PITCH.left + b.r, Math.min(PITCH.right - b.r, b.x));
      b.y = Math.max(PITCH.top + b.r, Math.min(PITCH.bottom - b.r, b.y));
    }
  }
}

/** Kick-off: both shapes, ball on the centre spot, one striker of the kicking side behind it. */
export function kickoff(teams: [TeamSetup, TeamSetup], kicking: Side, keeperSpeed: [number, number]): World {
  const bodies: Body[] = [];
  let id = 0;
  ([0, 1] as Side[]).forEach((s) => {
    shapeOf(s, teams[s]).forEach(([x, y]) => bodies.push({ id: id++, kind: 'disc', side: s, x, y, vx: 0, vy: 0, r: R_DISC, m: 1, spin: 0 }));
  });
  ([0, 1] as Side[]).forEach((s) => bodies.push({ id: id++, kind: 'keeper', side: s, x: 300, y: s === 0 ? PITCH.bottom - 24 : PITCH.top + 24, vx: 0, vy: 0, r: R_KEEPER, m: 1, spin: 0 }));
  bodies.push({ id: id++, kind: 'ball', side: -1, x: 300, y: PITCH.midY, vx: 0, vy: 0, r: R_BALL, m: 0.42, spin: 0 });
  const w: World = { bodies, keeperSpeed, touches: [], goal: null, t: 0 };
  // Everyone outside the centre circle except the kicker, who stands behind the ball.
  for (const b of bodies) {
    if (b.kind !== 'disc') continue;
    const dx = b.x - 300, dy = b.y - PITCH.midY, d = Math.hypot(dx, dy) || 1;
    if (d < 78) { b.x = 300 + (dx / d) * 80; b.y = PITCH.midY + (dy / d) * 80; }
    if (b.side === 0 && b.y < PITCH.midY + R_DISC) b.y = PITCH.midY + R_DISC + 2;
    if (b.side === 1 && b.y > PITCH.midY - R_DISC) b.y = PITCH.midY - R_DISC - 2;
  }
  const mine = discsOf(w, kicking);
  const striker = mine.reduce((a, b) => (Math.hypot(a.x - 300, a.y - PITCH.midY) < Math.hypot(b.x - 300, b.y - PITCH.midY) ? a : b));
  striker.x = 300 + 8; striker.y = PITCH.midY + (kicking === 0 ? 1 : -1) * (R_DISC + R_BALL + 10);
  separate(w);
  ball(w).x = 300; ball(w).y = PITCH.midY;
  return w;
}

export interface FlickResult {
  goal: Side | null;
  keep: boolean;
  touched: boolean;
  /** Who has the ball nearest at rest. */
  nearest: Side;
}

/** Decide what happens after a flick by `side` with piece `pieceId`, once everything has stopped. */
export function judge(w: World, side: Side, pieceId: number): FlickResult {
  const bl = ball(w);
  const touched = w.touches.includes(pieceId);
  const last = w.touches.length ? w.bodies.find((b) => b.id === w.touches[w.touches.length - 1]) : undefined;
  const discs = w.bodies.filter((b) => b.kind === 'disc');
  const near = discs.reduce((a, b) => (Math.hypot(a.x - bl.x, a.y - bl.y) < Math.hypot(b.x - bl.x, b.y - bl.y) ? a : b));
  const nearest = near.side as Side;
  const lostToOpponent = !!last && last.side !== side && last.kind === 'disc';
  const keep = w.goal === null && touched && !lostToOpponent && nearest === side && Math.hypot(near.x - bl.x, near.y - bl.y) < 110;
  return { goal: w.goal, keep, touched, nearest };
}

// ---------- Computer opponent ----------

export interface AiMove { piece: number; angle: number; power: number; score: number }

/** Where a piece must aim so the ball leaves in direction (ux, uy). */
function ghostAim(d: Body, bx: number, by: number, ux: number, uy: number): { angle: number; cut: number } | null {
  const gx = bx - ux * (R_BALL + R_DISC), gy = by - uy * (R_BALL + R_DISC);
  const ax = gx - d.x, ay = gy - d.y, al = Math.hypot(ax, ay);
  if (al < 8) return null;
  const cut = (ax * ux + ay * uy) / al; // 1 = straight on
  if (cut < 0.35) return null;
  return { angle: Math.atan2(ay, ax), cut };
}

/**
 * Try candidate flicks in a copy of the world and score where things end.
 * `skill` 0..1: lower skill adds aim error and sometimes takes a worse option.
 */
export function aiChoose(w: World, side: Side, skill: number, rng: Rng, flicksLeft: number): AiMove {
  const bl = ball(w);
  const goalY = side === 1 ? PITCH.bottom + 10 : PITCH.top - 10;
  const mates = discsOf(w, side);
  const dir = side === 1 ? 1 : -1;
  const targets: Array<[number, number, 'shot' | 'pass' | 'clear']> = [
    [PITCH.mouthL + 22, goalY, 'shot'], [300, goalY, 'shot'], [PITCH.mouthR - 22, goalY, 'shot'],
  ];
  // Passes to team-mates further up the pitch.
  mates.filter((m) => (m.y - bl.y) * dir > 30 && Math.hypot(m.x - bl.x, m.y - bl.y) < 360)
    .sort((a, b) => (b.y - a.y) * dir - (a.y - b.y) * dir).slice(0, 3)
    .forEach((m) => targets.push([m.x, m.y - dir * 30, 'pass']));
  targets.push([bl.x < 300 ? PITCH.left + 30 : PITCH.right - 30, bl.y + dir * 260, 'clear']);
  const shooters = [...mates].sort((a, b) => Math.hypot(a.x - bl.x, a.y - bl.y) - Math.hypot(b.x - bl.x, b.y - bl.y)).slice(0, 4);
  const cands: AiMove[] = [];
  for (const d of shooters) {
    for (const [tx, ty, kind] of targets) {
      const ux0 = tx - bl.x, uy0 = ty - bl.y, ul = Math.hypot(ux0, uy0) || 1;
      const g = ghostAim(d, bl.x, bl.y, ux0 / ul, uy0 / ul);
      if (!g) continue;
      const dist = Math.hypot(bl.x - d.x, bl.y - d.y);
      const powers = kind === 'pass' ? [0.42, 0.58] : kind === 'shot' ? [0.78, 0.95] : [0.7];
      for (const p0 of powers) {
        const p = Math.min(1, p0 + dist / 2400);
        cands.push({ piece: d.id, angle: g.angle, power: p, score: 0 });
      }
    }
  }
  // Fallback: hit the ball straight.
  if (!cands.length) {
    const d = shooters[0];
    cands.push({ piece: d.id, angle: Math.atan2(bl.y - d.y, bl.x - d.x), power: 0.7, score: 0 });
  }
  for (const c of cands) {
    const sim = cloneWorld(w);
    flick(sim, c.piece, c.angle, c.power);
    settle(sim, 4.5);
    c.score = evaluate(sim, side, c.piece, flicksLeft);
  }
  cands.sort((a, b) => b.score - a.score);
  const pickIdx = skill > 0.85 ? 0 : rng.int(0, Math.min(cands.length - 1, skill > 0.55 ? 1 : 3));
  const best = cands[pickIdx];
  const err = (1 - skill) * 0.11;
  return { ...best, angle: best.angle + rng.gauss() * err, power: Math.max(0.2, Math.min(1, best.power + rng.gauss() * err)) };
}

function evaluate(w: World, side: Side, piece: number, flicksLeft: number): number {
  if (w.goal === side) return 10000;
  if (w.goal !== null) return -20000;
  const bl = ball(w);
  const r = judge(w, side, piece);
  const progress = side === 1 ? bl.y - PITCH.top : PITCH.bottom - bl.y; // 0 = own goal line
  let s = progress * 2;
  if (r.keep && flicksLeft > 1) s += 260;
  if (r.nearest === side) s += 120; else s -= 160;
  if (!r.touched) s -= 400;
  const ownGoalDist = Math.hypot(bl.x - 300, bl.y - (side === 1 ? PITCH.top : PITCH.bottom));
  if (ownGoalDist < 200) s -= (200 - ownGoalDist) * 3;
  return s;
}
