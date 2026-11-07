import type { Rng } from '../../engine/rng';

// Five Stones (পাঁচ গুটি / ঘুটি): toss one stone up, scoop stones from the floor, catch before it lands.
// Stage 1: one at a time (4 tosses). Stage 2: two at a time. Stage 3: three, then one.
// Stage 4: all four at once. Stage 5 (হাতের পিঠ): toss all five, catch them on the back of
// the hand, toss again and catch in the palm. Catch at least two to finish.

export const GROUPS: number[][] = [[1, 1, 1, 1], [2, 2], [3, 1], [4]];
export const STAGES = 5;

export interface Progress { stage: number; group: number; points: number; done: boolean }
export const newProgress = (): Progress => ({ stage: 0, group: 0, points: 0, done: false });

export type Level = 'easy' | 'medium' | 'hard';
export const AIRTIME: Record<Level, number> = { easy: 1.55, medium: 1.25, hard: 1.02 };
/** The catch window: the last part of the fall, as a fraction of the height. */
export const WINDOW: Record<Level, number> = { easy: 0.42, medium: 0.34, hard: 0.27 };

export interface Stone { x: number; y: number; r: number; held: boolean; tosser: boolean; tint: string }

const TINTS = ['#c9b79c', '#b8a48a', '#d7c7ad', '#a99577', '#cfbfa3'];

/** Scatter four floor stones (the fifth is the tosser in the hand). */
export function scatter(rng: Rng, W: number, top: number, bottom: number, spread = 1): Stone[] {
  const out: Stone[] = [];
  const cx = W / 2, cy = (top + bottom) / 2;
  for (let i = 0; i < 4; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(40, 170) * spread;
      const x = Math.max(60, Math.min(W - 60, cx + Math.cos(a) * d * 1.3));
      const y = Math.max(top + 30, Math.min(bottom - 30, cy + Math.sin(a) * d * 0.8));
      if (out.every((s) => Math.hypot(s.x - x, s.y - y) > 64)) { out.push({ x, y, r: 17, held: false, tosser: false, tint: TINTS[i] }); break; }
    }
    if (out.length <= i) out.push({ x: 80 + i * 110, y: cy, r: 17, held: false, tosser: false, tint: TINTS[i] });
  }
  return out;
}

/** Points for finishing a stage group. */
export const groupPoints = (stage: number, size: number) => (stage + 1) * size * 10;

/** Advance progress after a successful toss. */
export function advance(p: Progress): Progress {
  if (p.stage >= GROUPS.length) return p;
  const groups = GROUPS[p.stage];
  const size = groups[p.group];
  const points = p.points + groupPoints(p.stage, size);
  if (p.group + 1 < groups.length) return { ...p, group: p.group + 1, points };
  return { ...p, stage: p.stage + 1, group: 0, points };
}

/** Stage 5: how many stones a tap catches, by timing error in seconds. */
export function backHandCatch(errSec: number): number {
  const e = Math.abs(errSec);
  return e < 0.05 ? 5 : e < 0.09 ? 4 : e < 0.13 ? 3 : e < 0.18 ? 2 : e < 0.24 ? 1 : 0;
}

/** Computer success chance for one toss, by level and stage. */
export function aiChance(level: Level, stage: number): number {
  const base = level === 'easy' ? 0.8 : level === 'medium' ? 0.88 : 0.95;
  return base - stage * 0.025;
}
