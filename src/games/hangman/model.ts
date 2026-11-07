// Hangman rules, for English and Bangla words.
//
// English: guess letters A–Z.
// Bangla: the keyboard has the base letters. A vowel sign (কার) counts as its vowel:
// কি needs ক and ই. Hasant and joiners are ignored, so ক্ষ needs ক and ষ.
// A written cluster (grapheme) shows only when every letter in it has been guessed.

export type Script = 'bn' | 'en';

export const BN_VOWELS = ['অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'এ', 'ঐ', 'ও', 'ঔ'];
export const BN_CONSONANTS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন', 'প', 'ফ', 'ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ', 'স', 'হ', 'ড়', 'ঢ়', 'য়', 'ৎ', 'ং', 'ঃ', 'ঁ'];
export const EN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const SIGN_TO_VOWEL: Record<string, string> = { 'া': 'আ', 'ি': 'ই', 'ী': 'ঈ', 'ু': 'উ', 'ূ': 'ঊ', 'ৃ': 'ঋ', 'ে': 'এ', 'ৈ': 'ঐ', 'ো': 'ও', 'ৌ': 'ঔ' };
const NUKTA: Record<string, string> = { 'ড': 'ড়', 'ঢ': 'ঢ়', 'য': 'য়' };
const IGNORE = new Set(['্', '‌', '‍', 'ৗ']);

export function keyboard(script: Script): string[] {
  return script === 'en' ? EN_LETTERS : [...BN_VOWELS, ...BN_CONSONANTS];
}

/** Split a word into written clusters. */
export function graphemes(word: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg('bn', { granularity: 'grapheme' }).segment(word)].map((s) => s.segment);
  // Fallback: join signs and hasant joins onto the previous letter.
  const out: string[] = [];
  const cps = [...word];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    const joins = /[ঁ-ঃ়-্ৗ‌‍]/.test(c) || (i > 0 && cps[i - 1] === '্');
    if (joins && out.length) out[out.length - 1] += c; else out.push(c);
  }
  return out;
}

/** The keyboard letters needed to show one cluster. Empty for spaces and punctuation. */
export function lettersOf(cluster: string, script: Script): string[] {
  if (script === 'en') return /[A-Z]/.test(cluster) ? [cluster] : [];
  const cps = [...cluster.normalize('NFC')];
  const out: string[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (IGNORE.has(c)) continue;
    if (c === '়') { const prev = out.pop(); out.push(prev && NUKTA[prev] ? NUKTA[prev] : prev ?? ''); continue; }
    if (SIGN_TO_VOWEL[c]) { out.push(SIGN_TO_VOWEL[c]); continue; }
    if (/[ঀ-৿]/.test(c)) out.push(c);
  }
  return out.filter(Boolean);
}

export interface HMState {
  word: string;
  script: Script;
  clusters: string[];
  needs: string[][];
  guessed: string[];
  wrong: string[];
  lives: number;
  hints: number;
  status: 'play' | 'won' | 'lost';
}

export function newRound(word: string, script: Script, lives: number): HMState {
  const w = script === 'en' ? word.toUpperCase() : word.normalize('NFC');
  const clusters = graphemes(w);
  return { word: w, script, clusters, needs: clusters.map((c) => lettersOf(c, script)), guessed: [], wrong: [], lives, hints: 0, status: 'play' };
}

export const allLetters = (s: HMState) => [...new Set(s.needs.flat())];
export const isShown = (s: HMState, i: number) => s.status === 'lost' || s.needs[i].every((l) => s.guessed.includes(l));

export function guess(s: HMState, letter: string): HMState {
  if (s.status !== 'play' || s.guessed.includes(letter) || s.wrong.includes(letter)) return s;
  const hit = s.needs.some((n) => n.includes(letter));
  const next: HMState = hit ? { ...s, guessed: [...s.guessed, letter] } : { ...s, wrong: [...s.wrong, letter] };
  if (allLetters(next).every((l) => next.guessed.includes(l))) return { ...next, status: 'won' };
  if (next.wrong.length + next.hints >= next.lives) return { ...next, status: 'lost' };
  return next;
}

/** A hint shows one missing letter and costs one life. */
export function hint(s: HMState, pick: (a: string[]) => string): HMState {
  if (s.status !== 'play') return s;
  const missing = allLetters(s).filter((l) => !s.guessed.includes(l));
  if (missing.length <= 1 || s.wrong.length + s.hints + 1 >= s.lives) return s;
  const l = pick(missing);
  const n: HMState = { ...s, guessed: [...s.guessed, l], hints: s.hints + 1 };
  return allLetters(n).every((x) => n.guessed.includes(x)) ? { ...n, status: 'won' } : n;
}

export const livesLeft = (s: HMState) => s.lives - s.wrong.length - s.hints;

/** Points for a saved word: lives left count most, long words a little. */
export const roundPoints = (s: HMState) => (s.status === 'won' ? 10 * livesLeft(s) + allLetters(s).length * 2 : 0);

/** Check a word typed by a friend: it must use only letters on the keyboard. */
export function validWord(word: string, script: Script): boolean {
  const w = script === 'en' ? word.toUpperCase().trim() : word.normalize('NFC').trim();
  if (w.length < 2 || w.length > 24) return false;
  const keys = new Set(keyboard(script));
  const parts = graphemes(w).map((c) => lettersOf(c, script));
  if (!parts.flat().length) return false;
  if (script === 'en' && /[^A-Z '\-]/.test(w)) return false;
  if (script === 'bn' && /[^ঀ-৿ ‌‍-]/.test(w)) return false;
  return parts.flat().every((l) => keys.has(l));
}
