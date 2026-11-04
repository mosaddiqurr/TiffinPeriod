import type { ShellConfig } from '../components/GameShell';
import { fmtNum } from '../platform/i18n';
import type { RaceTexts } from './race';
import { RACER_COLORS } from './race';

// Helpers shared by the race games: texts in both languages and the lane roster.

const AI_NAMES = { bn: ['রাফি', 'মিতু', 'শুভ'], en: ['Rafi', 'Mitu', 'Shuvo'] };

export function raceTexts(lang: 'bn' | 'en'): RaceTexts {
  const bnPlace = ['১ম', '২য়', '৩য়', '৪র্থ', '৫ম', '৬ষ্ঠ'];
  const enPlace = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  return lang === 'bn'
    ? { num: (n) => fmtNum(n, 'bn'), secs: (s) => `${fmtNum(s.toFixed(1), 'bn')} সে.`, place: (n) => bnPlace[n - 1] ?? fmtNum(n, 'bn'), dnf: 'শেষ করেনি', won: (n) => `${n} প্রথম হয়েছে!`, ready: 'তৈরি হও…' }
    : { num: (n) => String(n), secs: (s) => `${s.toFixed(1)} s`, place: (n) => enPlace[n - 1] ?? String(n), dnf: 'Did not finish', won: (n) => `${n} wins!`, ready: 'Get ready…' };
}

export interface RosterEntry { player: number; name: string; color: string }

/**
 * Lane order from top to bottom. Player 1 is always the bottom lane, next to
 * Player 1's pads. In two-player mode Player 2 is the top lane, next to the
 * flipped pads.
 */
export function raceRoster(cfg: ShellConfig, aiCount: number): RosterEntry[] {
  const ai = AI_NAMES[cfg.lang];
  const list: RosterEntry[] = [];
  if (cfg.mode === 'local2p') list.push({ player: 1, name: cfg.names[1], color: RACER_COLORS[1] });
  for (let i = 0; i < aiCount; i++) list.push({ player: -1, name: ai[i % ai.length], color: RACER_COLORS[2 + (i % 2)] });
  list.push({ player: 0, name: cfg.names[0], color: RACER_COLORS[0] });
  return list;
}
