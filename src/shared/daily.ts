import { readJSON, writeJSON } from '../platform/storage';
import { hashString } from './teams';

// Daily challenges. The seed comes from the calendar date, so everyone who
// plays on the same day gets the same challenge. Today the best score stays on
// this device; a future online leaderboard can use the same seed and score.

export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dailySeed(game: string, key = todayKey()): number {
  return hashString(`${game}:${key}`);
}

export interface DailyRecord { best: number; tries: number; won: boolean }
export interface DailyBook { days: Record<string, DailyRecord>; streak: number; lastDay?: string }

const load = (game: string): DailyBook => readJSON<DailyBook>(`daily.${game}`, { days: {}, streak: 0 });

export function dailyRecord(game: string, key = todayKey()): DailyRecord | null {
  return load(game).days[key] ?? null;
}

export function dailyStreak(game: string): number {
  return load(game).streak;
}

/** Save a daily attempt. Returns whether it beat today's best. */
export function saveDaily(game: string, score: number, won: boolean, key = todayKey()): { best: boolean; record: DailyRecord; streak: number } {
  const b = load(game);
  const old = b.days[key];
  const record: DailyRecord = { best: Math.max(old?.best ?? -Infinity, score), tries: (old?.tries ?? 0) + 1, won: (old?.won ?? false) || won };
  let streak = b.streak;
  if (!old) {
    const y = new Date(key + 'T12:00:00');
    y.setDate(y.getDate() - 1);
    streak = b.lastDay === todayKey(y) ? streak + 1 : 1;
  }
  const days = { ...b.days, [key]: record };
  // Keep the last 60 days only.
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete days[k];
  writeJSON(`daily.${game}`, { days, streak, lastDay: key });
  return { best: !old || score > old.best, record, streak };
}

/** Text to paste into a chat. It has no link and no personal data. */
export function shareText(lines: string[]): string {
  return lines.join('\n');
}

export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) { await nav.share({ text }); return 'shared'; }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
