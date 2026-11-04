import { readJSON, writeJSON } from './storage';
import { createStore, useStore } from './store';

export type Lang = 'bn' | 'en';

export interface PlayerProfile {
  name: string;
  color: string;
}

export interface Settings {
  lang: Lang;
  sound: boolean;
  volume: number; // 0..1
  voice: boolean; // spoken announcements (Web Speech API)
  haptics: boolean;
  reducedMotion: boolean;
  /** Simple tapping instead of rhythm timing in rhythm games. */
  inputAssist: boolean;
  players: [PlayerProfile, PlayerProfile];
}

function systemReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'bn',
  sound: true,
  volume: 0.8,
  voice: false,
  haptics: true,
  reducedMotion: systemReducedMotion(),
  inputAssist: false,
  players: [
    { name: '', color: '#c0392b' },
    { name: '', color: '#1f4e9c' },
  ],
};

const saved = readJSON<Partial<Settings>>('settings', {});

export const settingsStore = createStore<Settings>(
  { ...DEFAULT_SETTINGS, ...saved, players: (saved.players as Settings['players']) ?? DEFAULT_SETTINGS.players },
  (v) => {
    writeJSON('settings', v);
    applyDocumentLang(v.lang);
  },
);

export function useSettings(): Settings {
  return useStore(settingsStore);
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

export function applyDocumentLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

applyDocumentLang(settingsStore.get().lang);
