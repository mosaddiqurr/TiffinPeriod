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
  { id: 'pf-win', gameId: 'pen-fight', title: { bn: 'কলমবাজ', en: 'Pen Master' }, desc: { bn: 'কম্পিউটারকে কলম যুদ্ধে হারাও।', en: 'Beat the computer at Pen Fight.' } },
  { id: 'pf-hard', gameId: 'pen-fight', title: { bn: 'শেষ বেঞ্চের ওস্তাদ', en: 'Back-Bench Boss' }, desc: { bn: 'কঠিন কম্পিউটারকে হারাও।', en: 'Beat the hard computer.' } },
  { id: 'rb-clear', gameId: 'rubber-band', title: { bn: 'বেঞ্চ সাফ', en: 'Clean Desk' }, desc: { bn: 'এক লেভেলের সব নিশানা ফেলো।', en: 'Knock down every target in a level.' } },
  { id: 'rb-sniper', gameId: 'rubber-band', title: { bn: 'নিশানাবাজ', en: 'Sharp Shooter' }, desc: { bn: 'মোট ২৫০ পয়েন্ট।', en: 'Score 250 in total.' } },
  { id: 'nd-party', gameId: 'notebook-drawing', title: { bn: 'আঁকার আসর', en: 'Drawing Party' }, desc: { bn: 'বন্ধুদের সাথে একটা খেলা শেষ করো।', en: 'Finish a party game.' } },
  { id: 'nd-eagle-eye', gameId: 'notebook-drawing', title: { bn: 'বাজপাখির চোখ', en: 'Eagle Eye' }, desc: { bn: 'কম্পিউটারের আঁকায় ৬০০ পয়েন্ট।', en: 'Score 600 when the computer draws.' } },
  { id: 'eb-win', gameId: 'elonti-belonti', title: { bn: 'ছুঁয়ে দিলাম!', en: 'Touched!' }, desc: { bn: 'এলন্টি বেলন্টি জেতো।', en: 'Win Elonti Belonti.' } },
  { id: 'eb-statue', gameId: 'elonti-belonti', title: { bn: 'পাথরের মূর্তি', en: 'Statue' }, desc: { bn: 'একবারও ধরা না পড়ে জেতো।', en: 'Finish without being caught.' } },
  { id: 'sm-win', gameId: 'spoon-marble', title: { bn: 'স্থির হাত', en: 'Steady Mouth' }, desc: { bn: 'চামচ-মার্বেল দৌড় জেতো।', en: 'Win the spoon and marble race.' } },
  { id: 'sm-steady', gameId: 'spoon-marble', title: { bn: 'একবারও পড়েনি', en: 'Never Dropped' }, desc: { bn: 'মার্বেল না ফেলে শেষ করো।', en: 'Finish without dropping the marble.' } },
  { id: 'hb-break', gameId: 'haari-bhanga', title: { bn: 'ঠাস!', en: 'Smash!' }, desc: { bn: 'হাঁড়ি ভাঙো।', en: 'Break the pot.' } },
  { id: 'hb-one-swing', gameId: 'haari-bhanga', title: { bn: 'এক বাড়িতে', en: 'One Swing' }, desc: { bn: 'প্রথম বাড়িতেই হাঁড়ি ভাঙো।', en: 'Break the pot with the first swing.' } },
  { id: 'pp-far', gameId: 'paper-plane', title: { bn: 'পাড়া পেরিয়ে', en: 'Over the Para' }, desc: { bn: 'এক ছোড়ায় ৪০০ পয়েন্ট।', en: 'Score 400 in one throw.' } },
  { id: 'pp-ace', gameId: 'paper-plane', title: { bn: 'পাইলট', en: 'Ace Pilot' }, desc: { bn: 'এক ছোড়ায় ৬০০ পয়েন্ট।', en: 'Score 600 in one throw.' } },
  { id: 'pb-win', gameId: 'paper-boat', title: { bn: 'বর্ষার রাজা', en: 'Monsoon King' }, desc: { bn: 'নৌকা দৌড় জেতো।', en: 'Win the paper boat race.' } },
  { id: 'pb-dry', gameId: 'paper-boat', title: { bn: 'শুকনো খটখটে', en: 'Bone Dry' }, desc: { bn: '৩৫%-এর কম ভিজে শেষ করো।', en: 'Finish less than 35 % wet.' } },
  { id: 'mc-win', gameId: 'musical-chairs', title: { bn: 'শেষ চেয়ার', en: 'Last Chair' }, desc: { bn: 'মিউজিক্যাল চেয়ার জেতো।', en: 'Win musical chairs.' } },
  { id: 'mc-clean', gameId: 'musical-chairs', title: { bn: 'ধৈর্যশীল', en: 'Patient' }, desc: { bn: 'একবারও ফাউল না করে জেতো।', en: 'Win without a foul.' } },
  { id: 'sr-win', gameId: 'sack-race', title: { bn: 'বস্তার বাঘ', en: 'Sack Tiger' }, desc: { bn: 'বস্তা দৌড় জেতো।', en: 'Win the sack race.' } },
  { id: 'sr-nofall', gameId: 'sack-race', title: { bn: 'একবারও পড়িনি', en: 'No Falls' }, desc: { bn: 'একবারও না পড়ে শেষ করো।', en: 'Finish without falling.' } },
  { id: 'tl-win', gameId: 'three-legged', title: { bn: 'জোড়ায় জোড়ায়', en: 'Perfect Pair' }, desc: { bn: 'তিন পায়ে দৌড় জেতো।', en: 'Win the three-legged race.' } },
  { id: 'tl-clean', gameId: 'three-legged', title: { bn: 'এক তালে', en: 'In Step' }, desc: { bn: 'একবারও হোঁচট না খেয়ে শেষ করো।', en: 'Finish without a stumble.' } },
  { id: 'sp-win', gameId: 'short-pitch', title: { bn: 'পাড়ার ব্যাটসম্যান', en: 'Para Batter' }, desc: { bn: 'শর্ট-পিচ ম্যাচ জেতো।', en: 'Win a short-pitch match.' } },
  { id: 'hand-cricket-cup', gameId: 'hand-cricket', title: { bn: 'হাতের জাদু', en: 'Golden Hand' }, desc: { bn: 'হ্যান্ড ক্রিকেট কাপ জেতো।', en: 'Win the Hand Cricket cup.' } },
  { id: 'hand-cricket-ladder', gameId: 'hand-cricket', title: { bn: 'তাড়ার রাজা', en: 'Chase Master' }, desc: { bn: 'শেষ টার্গেট চ্যালেঞ্জ জেতো।', en: 'Win the last Target Challenge.' } },
  { id: 'book-cricket-cup', gameId: 'book-cricket', title: { bn: 'বইয়ের পোকা চ্যাম্পিয়ন', en: 'Bookworm Champion' }, desc: { bn: 'বই ক্রিকেট কাপ জেতো।', en: 'Win the Book Cricket cup.' } },
  { id: 'book-cricket-ladder', gameId: 'book-cricket', title: { bn: 'ভাগ্যের বরপুত্র', en: 'Lucky Pages' }, desc: { bn: 'শেষ টার্গেট চ্যালেঞ্জ জেতো।', en: 'Win the last Target Challenge.' } },
  { id: 'nc-win', gameId: 'number-cricket', title: { bn: 'চিরকুটের খেলোয়াড়', en: 'Chit Champ' }, desc: { bn: 'কম্পিউটারকে হারাও।', en: 'Beat the computer.' } },
  { id: 'nc-hard', gameId: 'number-cricket', title: { bn: 'মন পড়া', en: 'Mind Reader' }, desc: { bn: 'কঠিন কম্পিউটারকে হারাও।', en: 'Beat the hard computer.' } },
  { id: 'number-cricket-cup', gameId: 'number-cricket', title: { bn: 'নম্বরের নবাব', en: 'Numbers Nawab' }, desc: { bn: 'নম্বর ক্রিকেট কাপ জেতো।', en: 'Win the Number Cricket cup.' } },
  { id: 'number-cricket-ladder', gameId: 'number-cricket', title: { bn: 'শেষ বলের নায়ক', en: 'Last-Ball Hero' }, desc: { bn: 'শেষ টার্গেট চ্যালেঞ্জ জেতো।', en: 'Win the last Target Challenge.' } },
  { id: 'ff-win', gameId: 'flikk-football', title: { bn: 'টোকার ওস্তাদ', en: 'Flick Master' }, desc: { bn: 'ফ্লিক ফুটবলে কম্পিউটারকে হারাও।', en: 'Beat the computer at Flikk Football.' } },
  { id: 'ff-cup', gameId: 'flikk-football', title: { bn: 'বিশ্বকাপ ডেস্কে', en: 'World Cup on the Desk' }, desc: { bn: 'ফ্লিক ফুটবল কাপ জেতো।', en: 'Win the Flikk Football cup.' } },
  { id: 'ff-comeback', gameId: 'flikk-football', title: { bn: 'ফিরে আসা', en: 'Comeback Kid' }, desc: { bn: 'একটা কামব্যাক চ্যালেঞ্জ জেতো।', en: 'Win a comeback challenge.' } },
  { id: 'pk-cup', gameId: 'penalty', title: { bn: 'বরফ-শীতল', en: 'Ice Cold' }, desc: { bn: 'পেনাল্টি কাপ জেতো।', en: 'Win the penalty cup.' } },
  { id: 'pk-perfect', gameId: 'penalty', title: { bn: 'পাঁচে পাঁচ', en: 'Five from Five' }, desc: { bn: 'এক শুটআউটে পাঁচটাই গোল।', en: 'Score all five in a shootout.' } },
  { id: 'fs-clear', gameId: 'five-stones', title: { bn: 'গুটির রানি-রাজা', en: 'Stone Royalty' }, desc: { bn: 'সব ধাপ শেষ করো।', en: 'Clear every stage.' } },
  { id: 'db-win', gameId: 'dots-boxes', title: { bn: 'ঘরের মালিক', en: 'Box Owner' }, desc: { bn: 'কম্পিউটারকে হারাও।', en: 'Beat the computer.' } },
  { id: 'db-hard', gameId: 'dots-boxes', title: { bn: 'শিকলের কারিগর', en: 'Chain Maker' }, desc: { bn: 'কঠিন কম্পিউটারকে হারাও।', en: 'Beat the hard computer.' } },
  { id: 'hm-clean', gameId: 'hangman', title: { bn: 'নিখুঁত', en: 'Flawless' }, desc: { bn: 'একটাও ভুল না করে শব্দ বাঁচাও।', en: 'Save a word without a wrong guess.' } },
  { id: 'ef-land', gameId: 'eraser-flip', title: { bn: 'চেপে বসা', en: 'Right on Top' }, desc: { bn: 'বন্ধুর রাবারের উপর রাবার বসাও।', en: 'Land on the other eraser.' } },
  { id: 'ef-all', gameId: 'eraser-flip', title: { bn: 'ডেস্কের সেরা', en: 'Desk Legend' }, desc: { bn: 'সব চ্যালেঞ্জে তারা পাও।', en: 'Earn a star in every challenge.' } },
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
