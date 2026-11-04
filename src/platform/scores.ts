import { readJSON, writeJSON } from './storage';
import { createStore, useStore } from './store';
import type { Bi } from './i18n';

// Local records per game. No account and no server.

export interface GameStats {
  plays: number;
  wins: number;
  losses: number;
  ties: number;
  streak: number;
  bestStreak: number;
  /** Best score. The meaning depends on the game (runs, points, ms). */
  best: number | null;
  /** Named extra records, for example "fastestMs" or "highestInnings". */
  records: Record<string, number>;
}

export type Outcome = 'win' | 'loss' | 'tie' | 'none';

export interface ResultInput {
  outcome: Outcome;
  /** Score to compare with the best. */
  score?: number;
  /** true when a lower score is better (for example a time). */
  lowerIsBetter?: boolean;
  /** Extra records: key → value. Each key keeps its maximum unless the key ends in "Ms" (minimum kept). */
  records?: Record<string, number>;
}

export interface ResultSummary {
  newBest: boolean;
  previousBest: number | null;
  stats: GameStats;
  unlocked: Achievement[];
}

const EMPTY: GameStats = { plays: 0, wins: 0, losses: 0, ties: 0, streak: 0, bestStreak: 0, best: null, records: {} };

export const scoresStore = createStore<Record<string, GameStats>>(readJSON('scores', {}), (v) => writeJSON('scores', v));
export const achievementsStore = createStore<Record<string, number>>(readJSON('achievements', {}), (v) => writeJSON('achievements', v));

export function getStats(id: string): GameStats {
  return { ...EMPTY, ...(scoresStore.get()[id] ?? {}) };
}

export function useStats(id: string): GameStats {
  const all = useStore(scoresStore);
  return { ...EMPTY, ...(all[id] ?? {}) };
}

export function recordResult(gameId: string, r: ResultInput, achievementCheck?: (s: GameStats, r: ResultInput) => string[]): ResultSummary {
  const prev = getStats(gameId);
  const s: GameStats = { ...prev, records: { ...prev.records } };
  s.plays += 1;
  if (r.outcome === 'win') { s.wins += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  if (r.outcome === 'loss') { s.losses += 1; s.streak = 0; }
  if (r.outcome === 'tie') { s.ties += 1; }
  let newBest = false;
  if (r.score !== undefined && Number.isFinite(r.score)) {
    const better = s.best === null || (r.lowerIsBetter ? r.score < s.best : r.score > s.best);
    if (better) { newBest = s.best !== null || r.score > 0; s.best = r.score; }
  }
  for (const [k, v] of Object.entries(r.records ?? {})) {
    const old = s.records[k];
    const minKey = k.endsWith('Ms');
    if (old === undefined || (minKey ? v < old : v > old)) s.records[k] = v;
  }
  scoresStore.set((all) => ({ ...all, [gameId]: s }));
  const ids = achievementCheck ? achievementCheck(s, r) : [];
  const unlocked = ids.map(unlockAchievement).filter((a): a is Achievement => !!a);
  return { newBest, previousBest: prev.best, stats: s, unlocked };
}

// ---- Achievements ----

export interface Achievement {
  id: string;
  gameId: string;
  title: Bi;
  desc: Bi;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'hc-century', gameId: 'hand-cricket', title: { bn: 'সেঞ্চুরি!', en: 'Century!' }, desc: { bn: 'এক ইনিংসে ১০০ রান।', en: 'Score 100 in one innings.' } },
  { id: 'hc-hard-win', gameId: 'hand-cricket', title: { bn: 'ক্লাস ক্যাপ্টেন', en: 'Class Captain' }, desc: { bn: 'কঠিন কম্পিউটারকে হারাও।', en: 'Beat the hard computer.' } },
  { id: 'bc-fifty', gameId: 'book-cricket', title: { bn: 'হাফ সেঞ্চুরি', en: 'Half Century' }, desc: { bn: 'এক ব্যাটারের ৫০ রান।', en: 'One batter scores 50.' } },
  { id: 'bc-win', gameId: 'book-cricket', title: { bn: 'শেষ বেঞ্চের চ্যাম্পিয়ন', en: 'Back-Bench Champion' }, desc: { bn: 'একটা ম্যাচ জেতো।', en: 'Win a match.' } },
  { id: 'pu-streak20', gameId: 'pakhir-ure', title: { bn: 'চোখ-কান খোলা', en: 'Eyes and Ears Open' }, desc: { bn: 'টানা ২০টা ঠিক উত্তর।', en: '20 correct answers in a row.' } },
  { id: 'pu-fast', gameId: 'pakhir-ure', title: { bn: 'বিদ্যুৎ আঙুল', en: 'Lightning Finger' }, desc: { bn: '৩৫০ মিলিসেকেন্ডের কমে আঙুল তোলো।', en: 'Lift in under 350 ms.' } },
  { id: 'tw-win', gameId: 'tug-of-war', title: { bn: 'হেঁইয়ো জোয়ান', en: 'Heave-Ho Hero' }, desc: { bn: 'একটা ম্যাচ জেতো।', en: 'Win a match.' } },
  { id: 'tw-perfect', gameId: 'tug-of-war', title: { bn: 'তালের রাজা', en: 'King of Rhythm' }, desc: { bn: 'এক রাউন্ডে ১০টা নিখুঁত টান।', en: '10 perfect pulls in one round.' } },
  { id: 'bb-combo15', gameId: 'balloon-burst', title: { bn: 'ফটাফট', en: 'Pop Pop Pop' }, desc: { bn: '১৫ কম্বো।', en: 'Reach a 15 combo.' } },
  { id: 'bb-500', gameId: 'balloon-burst', title: { bn: 'মেলার সেরা', en: 'Star of the Mela' }, desc: { bn: 'এক রাউন্ডে ৫০০ পয়েন্ট।', en: '500 points in one round.' } },
  { id: 'br-win', gameId: 'biscuit-race', title: { bn: 'প্রথম পুরস্কার', en: 'First Prize' }, desc: { bn: 'বিস্কুট দৌড়ে প্রথম হও।', en: 'Win a biscuit race.' } },
  { id: 'br-one-bite', gameId: 'biscuit-race', title: { bn: 'এক কামড়ে', en: 'One Bite' }, desc: { bn: 'প্রথম লাফেই বিস্কুট ধরো।', en: 'Catch the biscuit on the first jump.' } },
];

export type AchievementListener = (a: Achievement) => void;
const listeners = new Set<AchievementListener>();
export function onAchievement(fn: AchievementListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function unlockAchievement(id: string): Achievement | null {
  if (achievementsStore.get()[id]) return null;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  achievementsStore.set((m) => ({ ...m, [id]: Date.now() }));
  listeners.forEach((fn) => fn(a));
  return a;
}

export function useAchievements(): Record<string, number> {
  return useStore(achievementsStore);
}
