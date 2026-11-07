import type { Rng } from '../../engine/rng';

// Penalty Shootout rules and the shot and save model (pure).
// Goal space: x from -1 (left post) to 1 (right post), y from 0 (ground) to 1 (crossbar),
// as seen by the kicker.

export interface Shot { x: number; y: number; power: number }
export type Outcome = 'goal' | 'saved' | 'post' | 'wide' | 'over';

export const KEEPER_HOME = { x: 0, y: 0.42 };
const REACH = 0.34;

/** Turn the aim and the power meter into where the ball really goes. */
export function strike(aimX: number, aimY: number, power: number, rng: Rng, pressure = 0): Shot {
  const over = Math.max(0, power - 0.82);
  const wobble = 0.035 + over * 0.5 + pressure * 0.03;
  return {
    x: aimX + rng.gauss() * wobble,
    y: Math.max(0.03, aimY + over * 2.6 + rng.gauss() * wobble * 0.8),
    power,
  };
}

/** Flight time in seconds: softer shots give the keeper more time. */
export const flightTime = (power: number) => 0.95 - Math.min(1, power) * 0.5;

export function onTarget(s: Shot): Outcome | null {
  const ax = Math.abs(s.x);
  if (s.y > 1.08 || ax > 1.08) return s.y > 1.08 && ax <= 1.08 ? 'over' : 'wide';
  if (ax > 0.97 || s.y > 0.96) return 'post';
  return null;
}

/** Where a keeper ends up after diving toward (tx, ty) for the time available. */
export function diveTo(tx: number, ty: number, time: number, speed: number): { x: number; y: number } {
  const dx = tx - KEEPER_HOME.x, dy = ty - KEEPER_HOME.y, d = Math.hypot(dx, dy);
  const can = Math.max(0, time) * speed;
  if (d <= can) return { x: tx, y: ty };
  return { x: KEEPER_HOME.x + (dx / d) * can, y: KEEPER_HOME.y + (dy / d) * can };
}

export function judge(s: Shot, keeper: { x: number; y: number }): Outcome {
  const off = onTarget(s);
  if (off) return off;
  // Corners are harder to reach fully stretched.
  const stretch = Math.hypot(s.x, s.y - 0.4) > 0.95 ? 0.8 : 1;
  return Math.hypot(s.x - keeper.x, (s.y - keeper.y) * 1.15) < REACH * stretch ? 'saved' : 'goal';
}

// ---------- Computer keeper ----------

export class KeeperAI {
  private sides: number[] = [];
  constructor(private skill: number, private rng: Rng) {}
  observe(x: number) { this.sides.push(Math.sign(x) * (Math.abs(x) > 0.25 ? 1 : 0)); }
  /** Choose a dive at the moment of the kick. It sees the run-up, not the ball's flight. */
  dive(s: Shot): { x: number; y: number; speed: number } {
    const speed = 1.7 + this.skill * 1.1;
    const read = this.rng.chance(0.28 + this.skill * 0.32);
    if (read) return { x: s.x + this.rng.gauss() * 0.22, y: s.y + this.rng.gauss() * 0.18, speed };
    return { ...this.guess(), speed };
  }
  /** A guess without seeing the ball, leaning toward the kicker's habit (also the online stand-in's dive). */
  guess(): { x: number; y: number } {
    const recent = this.sides.slice(-5);
    const habit = recent.length >= 3 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const r = this.rng.next();
    const guessSide = r < 0.18 ? 0 : (this.rng.chance(0.5 + habit * 0.3 * this.skill) ? 1 : -1);
    return { x: guessSide * this.rng.range(0.4, 0.85), y: this.rng.range(0.15, 0.8) };
  }
}

// ---------- Computer kicker ----------

export interface AiKick { shot: Shot; tell: number }

/** The computer's kick. `tell` (-1..1) is how its run-up leans; it is honest more often on easier levels. */
export function aiKick(skill: number, rng: Rng, pressure: number): AiKick {
  const side = rng.chance(0.12) ? 0 : rng.chance(0.5) ? 1 : -1;
  const x = side === 0 ? rng.range(-0.2, 0.2) : side * rng.range(0.35, 0.85 + skill * 0.08);
  const y = rng.range(0.1, 0.65 + skill * 0.25);
  const power = rng.range(0.55, 0.8 + skill * 0.05);
  const shot = strike(x, y, power, rng, pressure * (1 - skill));
  const honest = rng.chance(0.85 - skill * 0.45);
  const tell = (honest ? Math.sign(shot.x) : -Math.sign(shot.x)) * rng.range(0.4, 1);
  return { shot, tell };
}

/** Human keeper speed (goal units per second). */
export const HUMAN_DIVE = 2.4;

// ---------- Shootout bookkeeping ----------

export interface Shootout { kicks: [boolean[], boolean[]]; first: 0 | 1; best: number }

export function nextKicker(s: Shootout): 0 | 1 {
  const [a, b] = s.kicks;
  const second = s.first === 0 ? 1 : 0;
  const nFirst = s.kicks[s.first].length, nSecond = s.kicks[second].length;
  void a; void b;
  return nFirst > nSecond ? second : s.first;
}

export function goals(s: Shootout): [number, number] {
  return [s.kicks[0].filter(Boolean).length, s.kicks[1].filter(Boolean).length];
}

/** The winner once it is decided (or null while it goes on). */
export function decided(s: Shootout): 0 | 1 | null {
  const [ga, gb] = goals(s);
  const [na, nb] = [s.kicks[0].length, s.kicks[1].length];
  if (na <= s.best && nb <= s.best) {
    const la = s.best - na, lb = s.best - nb;
    if (ga > gb + lb) return 0;
    if (gb > ga + la) return 1;
    if (na === s.best && nb === s.best && ga !== gb) return ga > gb ? 0 : 1;
    return null;
  }
  if (na === nb && ga !== gb) return ga > gb ? 0 : 1;
  return null;
}
