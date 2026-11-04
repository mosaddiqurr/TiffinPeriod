import type { Rng } from '../../engine/rng';
import { RateLimiter } from '../../engine/timing';

// Balloon Burst field: spawning, motion, hit tests and scoring.
// Pure logic in field-local coordinates (0..w, 0..h), with y down.
// Two fields created with the same seed and size produce the same balloons,
// so split-screen play is fair.

export type Kind = 'normal' | 'gold' | 'tough' | 'cloud' | 'clock' | 'family' | 'mini';
export const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'orange'] as const;
export type BColor = (typeof COLORS)[number];

export interface Balloon {
  id: number;
  kind: Kind;
  color: BColor;
  x: number; y: number; r: number;
  vy: number; vx: number;
  sway: number; swayF: number; phase: number;
  hp: number;
  hitFlash: number;
}

export interface Scorer {
  score: number;
  combo: number;
  bestCombo: number;
  lastHit: number;
  pops: number;
  misses: number;
  clouds: number;
  taps: number;
  rain: number; // seconds of rain on the screen after a cloud pop
}

export type HitResult =
  | { type: 'pop'; b: Balloon; points: number; target: boolean; combo: number }
  | { type: 'damage'; b: Balloon }
  | { type: 'cloud'; b: Balloon; points: number }
  | { type: 'miss'; points: number }
  | { type: 'ignored' };

export const BASE: Record<Kind, number> = { normal: 10, gold: 30, tough: 25, cloud: -15, clock: 5, family: 10, mini: 8 };
export const COMBO_WINDOW = 1.2;
export const MAX_TAPS_PER_SEC = 10;

export function comboMultiplier(combo: number): number {
  return Math.min(3, 1 + Math.floor(combo / 5) * 0.5);
}

export class Field {
  t = 0;
  balloons: Balloon[] = [];
  scorers: Scorer[];
  targetColor: BColor = 'red';
  targetUntil = 0;
  timeLeft: number;
  private nextId = 1;
  private spawnIn = 0.4;
  private limiters: RateLimiter[];
  /** Balloons popped this frame, for the renderer to draw effects. */
  popped: Array<{ b: Balloon; scorer: number; points: number; target: boolean }> = [];
  lastTargetChange = 0;

  constructor(public w: number, public h: number, private rng: Rng, scorers: number, public duration: number, private clockBalloons: boolean) {
    this.scorers = Array.from({ length: scorers }, () => ({ score: 0, combo: 0, bestCombo: 0, lastHit: -99, pops: 0, misses: 0, clouds: 0, taps: 0, rain: 0 }));
    this.limiters = Array.from({ length: scorers }, () => new RateLimiter(MAX_TAPS_PER_SEC));
    this.timeLeft = duration;
    this.pickTarget();
  }

  get over() {
    return this.timeLeft <= 0;
  }

  private pickTarget() {
    const others = COLORS.filter((c) => c !== this.targetColor);
    this.targetColor = this.rng.pick(others);
    this.targetUntil = this.t + 8;
    this.lastTargetChange = this.t;
  }

  /** Speed scale so that a balloon crosses any field height in a similar time. */
  private get speedK() {
    return this.h / 700;
  }

  private spawn() {
    const t = this.t;
    const roll = this.rng.next() * 100;
    let kind: Kind = 'normal';
    if (t > 5 && roll < 6) kind = 'gold';
    else if (roll < 14) kind = 'tough';
    else if (t > 4 && roll < 24) kind = 'cloud';
    else if (this.clockBalloons && t > 8 && roll < 27) kind = 'clock';
    else if (roll < 31) kind = 'family';
    const r = kind === 'gold' ? 24 : kind === 'tough' ? 54 : kind === 'cloud' ? 42 : kind === 'family' ? 44 : this.rng.range(34, 42);
    const speed = (kind === 'gold' ? this.rng.range(250, 310) : kind === 'tough' ? 85 : kind === 'cloud' ? 95 : this.rng.range(105, 165)) + t * 1.6;
    const x = this.rng.range(r + 6, Math.max(r + 7, this.w - r - 6));
    this.balloons.push({
      id: this.nextId++, kind, color: kind === 'normal' || kind === 'tough' || kind === 'family' ? this.rng.pick(COLORS) : 'red',
      x, y: this.h + r * 1.4, r, vy: -speed * this.speedK, vx: 0,
      sway: this.rng.range(8, 26), swayF: this.rng.range(0.8, 1.8), phase: this.rng.range(0, 6.28),
      hp: kind === 'tough' ? 2 : 1, hitFlash: 0,
    });
  }

  update(dt: number) {
    if (this.over) return;
    this.t += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.popped = [];
    if (this.t >= this.targetUntil) this.pickTarget();
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      const density = Math.max(0.6, this.w / 520);
      this.spawnIn = Math.max(0.26, 0.78 - this.t * 0.008) / density;
    }
    for (const b of this.balloons) {
      b.y += b.vy * dt;
      b.vx *= Math.exp(-2 * dt);
      b.x += (b.vx + Math.cos(this.t * b.swayF + b.phase) * b.sway * b.swayF) * dt;
      b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
    }
    this.balloons = this.balloons.filter((b) => b.y > -b.r * 3);
    for (const s of this.scorers) s.rain = Math.max(0, s.rain - dt);
  }

  /** Topmost balloon under the point, with a forgiving hit area. */
  balloonAt(x: number, y: number): Balloon | null {
    let best: Balloon | null = null;
    let bestD = Infinity;
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      const dx = (x - b.x) / (b.r * 1.12);
      const dy = (y - b.y) / (b.r * 1.3);
      const d = dx * dx + dy * dy;
      if (d <= 1 && d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  hit(si: number, x: number, y: number): HitResult {
    if (this.over) return { type: 'ignored' };
    const s = this.scorers[si];
    if (!this.limiters[si].allow(this.t)) return { type: 'ignored' };
    s.taps++;
    const b = this.balloonAt(x, y);
    if (!b) {
      s.misses++;
      s.combo = 0;
      const p = s.score >= 2 ? -2 : 0;
      s.score += p;
      return { type: 'miss', points: p };
    }
    if (b.kind === 'tough' && b.hp > 1) {
      b.hp--;
      b.hitFlash = 1;
      b.vy *= 0.6;
      return { type: 'damage', b };
    }
    this.balloons = this.balloons.filter((o) => o !== b);
    if (b.kind === 'cloud') {
      s.clouds++;
      s.combo = 0;
      s.rain = 1.4;
      const p = Math.max(-s.score, BASE.cloud);
      s.score += p;
      this.popped.push({ b, scorer: si, points: p, target: false });
      return { type: 'cloud', b, points: p };
    }
    s.combo = this.t - s.lastHit <= COMBO_WINDOW ? s.combo + 1 : 1;
    s.lastHit = this.t;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.pops++;
    const target = (b.kind === 'normal' || b.kind === 'tough' || b.kind === 'family') && b.color === this.targetColor;
    const points = Math.round(BASE[b.kind] * (target ? 2 : 1) * comboMultiplier(s.combo));
    s.score += points;
    if (b.kind === 'clock') this.timeLeft = Math.min(this.duration, this.timeLeft + 3);
    if (b.kind === 'family') {
      for (let k = -1; k <= 1; k++) {
        this.balloons.push({
          id: this.nextId++, kind: 'mini', color: b.color, x: b.x + k * 16, y: b.y, r: 20,
          vy: b.vy * 1.6 - 60 * this.speedK, vx: k * 160, sway: 6, swayF: 2, phase: k, hp: 1, hitFlash: 0,
        });
      }
    }
    this.popped.push({ b, scorer: si, points, target });
    return { type: 'pop', b, points, target, combo: s.combo };
  }
}

// ---------- Computer pin ----------

export type Difficulty = 'easy' | 'medium' | 'hard';
const AIP: Record<Difficulty, { speed: number; aim: number; miss: number; think: number }> = {
  easy: { speed: 460, aim: 0.3, miss: 0.25, think: 0.7 },
  medium: { speed: 680, aim: 0.2, miss: 0.14, think: 0.48 },
  hard: { speed: 980, aim: 0.12, miss: 0.07, think: 0.3 },
};

export class BalloonAI {
  x: number;
  y: number;
  private target: number | null = null;
  private thinkIn = 0.5;
  private aimT = 0;
  constructor(private si: number, private diff: Difficulty, private rng: Rng, w: number, h: number) {
    this.x = w / 2;
    this.y = h * 0.6;
  }

  update(f: Field, dt: number): HitResult | null {
    if (f.over) return null;
    const p = AIP[this.diff];
    this.thinkIn -= dt;
    let tb = f.balloons.find((b) => b.id === this.target) ?? null;
    if (!tb || this.thinkIn <= 0) {
      this.thinkIn = p.think * this.rng.range(0.7, 1.3);
      let best: { b: (typeof f.balloons)[number]; u: number } | null = null;
      for (const b of f.balloons) {
        if (b.kind === 'cloud' || b.y > f.h - 10 || b.y < b.r) continue;
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        const worth = BASE[b.kind] * (b.color === f.targetColor ? 2 : 1);
        const u = worth / (d + 120);
        if (!best || u > best.u) best = { b, u };
      }
      tb = best?.b ?? null;
      this.target = tb?.id ?? null;
      this.aimT = 0;
    }
    if (!tb) return null;
    const lead = 0.12;
    const tx = tb.x, ty = tb.y + tb.vy * lead;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d > step) { this.x += (dx / d) * step; this.y += (dy / d) * step; }
    else { this.x = tx; this.y = ty; }
    if (d < tb.r * 0.7) {
      this.aimT += dt;
      if (this.aimT >= p.aim) {
        this.aimT = 0;
        const off = this.rng.chance(p.miss) ? tb.r * 1.8 : this.rng.range(-0.3, 0.3) * tb.r;
        const r = f.hit(this.si, tb.x + off, tb.y + off * 0.5);
        this.thinkIn = 0;
        return r;
      }
    }
    return null;
  }
}
