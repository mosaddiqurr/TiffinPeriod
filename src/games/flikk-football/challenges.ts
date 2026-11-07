import type { Bi } from '../../platform/i18n';
import { readJSON, writeJSON } from '../../platform/storage';
import type { Side } from './physics';

// Comeback and pressure scenarios. Turns count both sides (each side's turn is one step).

export type Goal = 'win' | 'draw' | 'clean' | 'score';

export interface FChallenge {
  id: string;
  title: Bi;
  desc: Bi;
  opp: string;
  skill: number;
  score: [number, number];
  minute: number;
  turns: number;
  kicking: Side;
  setup: 'kickoff' | 'attack';
  goal: Goal;
  /** For 'score': goals to score (from now). */
  n?: number;
}

export const CHALLENGES: FChallenge[] = [
  { id: 'c1', title: { bn: 'শেষ মুহূর্তের গোল', en: 'Late winner' }, desc: { bn: '০–০, ৮৬ মিনিট। জেতার গোলটা করো।', en: '0–0 at 86′. Score the winner.' }, opp: 'eng', skill: 0.5, score: [0, 0], minute: 86, turns: 4, kicking: 0, setup: 'kickoff', goal: 'win' },
  { id: 'c2', title: { bn: 'তিন টোকায় গোল', en: 'Three-flick goal' }, desc: { bn: 'বল তোমার পায়ে, বক্সের কাছে। এক পালাতেই গোল করো।', en: 'Ball at your feet near the box. Score in one turn.' }, opp: 'esp', skill: 0.6, score: [0, 0], minute: 70, turns: 1, kicking: 0, setup: 'attack', goal: 'score', n: 1 },
  { id: 'c3', title: { bn: 'এক গোলে পিছিয়ে', en: 'One goal down' }, desc: { bn: '০–১, ৮০ মিনিট। অন্তত সমতা ফেরাও।', en: '0–1 at 80′. Get at least a draw.' }, opp: 'ger', skill: 0.6, score: [0, 1], minute: 80, turns: 6, kicking: 0, setup: 'kickoff', goal: 'draw' },
  { id: 'c4', title: { bn: 'লিড ধরে রাখো', en: 'Hold the lead' }, desc: { bn: '১–০ এগিয়ে, ৮০ মিনিট। আর গোল খেয়ো না।', en: '1–0 up at 80′. Don’t concede.' }, opp: 'fra', skill: 0.72, score: [1, 0], minute: 80, turns: 6, kicking: 1, setup: 'kickoff', goal: 'clean' },
  { id: 'c5', title: { bn: 'সমতার গোল', en: 'The equaliser' }, desc: { bn: '১–২, ৮৮ মিনিট। হাতে দুই পালা। একটা গোল চাই।', en: '1–2 at 88′. Two turns. One goal.' }, opp: 'arg', skill: 0.7, score: [1, 2], minute: 88, turns: 3, kicking: 0, setup: 'kickoff', goal: 'score', n: 1 },
  { id: 'c6', title: { bn: 'বিশাল কামব্যাক', en: 'The great comeback' }, desc: { bn: '১–২, ৭৫ মিনিট। দুই গোল করে জেতো!', en: '1–2 at 75′. Score two and win!' }, opp: 'bra', skill: 0.68, score: [1, 2], minute: 75, turns: 10, kicking: 0, setup: 'kickoff', goal: 'win' },
  { id: 'c7', title: { bn: 'হ্যাটট্রিক', en: 'Hat-trick hero' }, desc: { bn: '০–০, ৬০ মিনিট। তিনটা গোল করো।', en: '0–0 at 60′. Score three.' }, opp: 'ned', skill: 0.62, score: [0, 0], minute: 60, turns: 14, kicking: 0, setup: 'kickoff', goal: 'score', n: 3 },
  { id: 'c8', title: { bn: 'ফাইনালের নাটক', en: 'Cup final drama' }, desc: { bn: '২–৩, ৮২ মিনিট, ফাইনাল। দুই গোল করে কাপ জেতো।', en: '2–3 at 82′ in the final. Score two to win it.' }, opp: 'arg', skill: 0.85, score: [2, 3], minute: 82, turns: 8, kicking: 0, setup: 'kickoff', goal: 'win' },
];

export function achieved(c: FChallenge, score: [number, number], winner: Side | null): boolean {
  const [me, them] = score;
  switch (c.goal) {
    case 'win': return winner === 0 || me > them;
    case 'draw': return me >= them;
    case 'clean': return them === c.score[1];
    case 'score': return me - c.score[0] >= (c.n ?? 1);
  }
}

export function starsOf(c: FChallenge, score: [number, number], winner: Side | null): number {
  if (!achieved(c, score, winner)) return 0;
  const [me, them] = score;
  let s = 1;
  if (me - them >= 2 || (c.goal === 'clean' && me > c.score[0]) || (c.goal === 'draw' && me > them)) s++;
  if (them === c.score[1]) s++;
  return Math.min(3, s);
}

export const loadChStars = (): Record<string, number> => readJSON('ff.ch', {});
export function saveChStars(id: string, s: number): Record<string, number> {
  const m = loadChStars();
  if ((m[id] ?? 0) < s) m[id] = s;
  writeJSON('ff.ch', m);
  return m;
}
