import type { Bi } from '../platform/i18n';
import { readJSON, writeJSON } from '../platform/storage';
import { createRng } from '../engine/rng';
import { dailySeed, todayKey } from './daily';
import { ratingOf, teamsFor } from './teams';

// Game modes shared by Hand Cricket, Book Cricket and Number Cricket:
// Target Challenge levels, the Daily Challenge and computer difficulty by team.

export type CricketMode = 'quick' | 'challenge' | 'tournament' | 'daily' | 'local';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Chase { target: number; balls: number; wickets: number }

export interface ChaseLevel extends Chase {
  n: number;
  opp: string;
  title: Bi;
}

const TITLES: Bi[] = [
  { bn: 'টিফিনের ওয়ার্ম-আপ', en: 'Tiffin warm-up' },
  { bn: 'পাওয়ারপ্লে', en: 'Powerplay' },
  { bn: 'মাঝের ওভার', en: 'Middle overs' },
  { bn: 'দ্রুত রান চাই', en: 'Up the rate' },
  { bn: 'শেষ দুই ওভার', en: 'Last two overs' },
  { bn: 'টেল-এন্ডারের লড়াই', en: 'Tail-end fight' },
  { bn: 'লম্বা তাড়া', en: 'The long chase' },
  { bn: 'শেষ ওভারের রোমাঞ্চ', en: 'Last-over thriller' },
  { bn: 'বড় লক্ষ্য', en: 'A big total' },
  { bn: 'নয় বলের নাটক', en: 'Nine-ball drama' },
  { bn: 'শেষ ব্যাটার', en: 'Last batter standing' },
  { bn: 'ফাইনালের তাড়া', en: 'The final chase' },
];

// [target, balls, wickets] per level. Each game has its own scoring speed.
const LADDERS: Record<string, Array<[number, number, number]>> = {
  'hand-cricket': [[12, 12, 3], [18, 12, 3], [22, 12, 2], [28, 18, 3], [30, 12, 3], [24, 9, 2], [38, 18, 2], [20, 6, 2], [42, 18, 2], [30, 9, 2], [18, 4, 1], [52, 18, 2]],
  'book-cricket': [[15, 12, 3], [20, 12, 3], [24, 12, 3], [30, 18, 3], [30, 12, 3], [24, 12, 2], [40, 18, 3], [20, 6, 3], [45, 18, 3], [30, 9, 3], [16, 6, 1], [60, 24, 3]],
  'number-cricket': [[12, 12, 3], [18, 12, 3], [22, 12, 2], [28, 18, 3], [30, 12, 3], [24, 9, 2], [38, 18, 2], [20, 6, 2], [42, 18, 2], [30, 9, 2], [18, 4, 1], [52, 18, 2]],
};

export function ladder(game: string): ChaseLevel[] {
  const opps = teamsFor('cricket').filter((t) => t.id !== 'ban').sort((a, b) => ratingOf(a, 'cricket') - ratingOf(b, 'cricket'));
  const rows = LADDERS[game] ?? LADDERS['hand-cricket'];
  return rows.map(([target, balls, wickets], i) => ({
    n: i + 1, target, balls, wickets, title: TITLES[i % TITLES.length],
    opp: opps[Math.min(opps.length - 1, Math.round((i / (rows.length - 1)) * (opps.length - 1)))].id,
  }));
}

/** 1 star for a win, +1 with a quarter of the balls left, +1 without losing a wicket. */
export function starsFor(c: Chase, won: boolean, ballsUsed: number, wicketsLost: number): number {
  if (!won) return 0;
  return 1 + (c.balls - ballsUsed >= Math.ceil(c.balls / 4) ? 1 : 0) + (wicketsLost === 0 ? 1 : 0);
}

export const loadStars = (game: string): Record<number, number> => readJSON(`ladder.${game}`, {});
export function saveStars(game: string, level: number, stars: number): Record<number, number> {
  const s = loadStars(game);
  if ((s[level] ?? 0) < stars) s[level] = stars;
  writeJSON(`ladder.${game}`, s);
  return s;
}
export const isUnlocked = (stars: Record<number, number>, n: number) => n === 1 || (stars[n - 1] ?? 0) > 0;

export interface DailyChase extends Chase { opp: string; seed: number; key: string }

/** Today's chase. It is the same for everyone on the same day. */
export function dailyChase(game: string, key = todayKey()): DailyChase {
  const seed = dailySeed(game, key);
  const rng = createRng(seed);
  const levels = LADDERS[game] ?? LADDERS['hand-cricket'];
  const base = levels[rng.int(3, levels.length - 2)];
  const opps = teamsFor('cricket').filter((t) => t.id !== 'ban');
  const target = Math.max(8, Math.round(base[0] * rng.range(0.9, 1.15)));
  return { target, balls: base[1], wickets: base[2], opp: rng.pick(opps).id, seed, key };
}

/** Daily score: runs, plus a bonus for a win with balls and wickets to spare. */
export function dailyScore(runs: number, won: boolean, ballsLeft: number, wicketsLeft: number): number {
  return runs + (won ? 25 + ballsLeft * 4 + wicketsLeft * 8 : 0);
}

export function difficultyFor(rating: number): Difficulty {
  return rating >= 9 ? 'hard' : rating >= 6 ? 'medium' : 'easy';
}
