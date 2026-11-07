import { addBall, decideMatch, inningsComplete, newInnings, type Innings, type Limits, type MatchResult } from '../../shared/cricket';
import type { Rng } from '../../engine/rng';
import type { Bi } from '../../platform/i18n';

// Book Cricket rules.
// The batter opens a schoolbook at a random place. The LAST DIGIT of the
// LEFT-hand page number decides the ball. Left pages are even, so the digit
// is 0, 2, 4, 6 or 8. Schools used different meanings for 0 and 8, so the
// mapping is data (a RuleSet), not code. Players can also make their own.

export type Digit = 0 | 2 | 4 | 6 | 8;
export const DIGITS: Digit[] = [0, 2, 4, 6, 8];

export type Outcome =
  | { kind: 'out' }
  | { kind: 'runs'; runs: number } // runs = 0 is a dot ball
  | { kind: 'nb' };                // no-ball: +1 run, the ball does not count

export interface RuleSet {
  id: string;
  name: Bi;
  map: Record<Digit, Outcome>;
}

export const PRESETS: RuleSet[] = [
  {
    id: 'classic',
    name: { bn: 'ক্লাসিক: ০ = আউট, ৮ = ১ রান', en: 'Classic: 0 = out, 8 = 1 run' },
    map: { 0: { kind: 'out' }, 2: { kind: 'runs', runs: 2 }, 4: { kind: 'runs', runs: 4 }, 6: { kind: 'runs', runs: 6 }, 8: { kind: 'runs', runs: 1 } },
  },
  {
    id: 'noball',
    name: { bn: 'নো-বল: ০ = আউট, ৮ = নো-বল', en: 'No-ball: 0 = out, 8 = no-ball' },
    map: { 0: { kind: 'out' }, 2: { kind: 'runs', runs: 2 }, 4: { kind: 'runs', runs: 4 }, 6: { kind: 'runs', runs: 6 }, 8: { kind: 'nb' } },
  },
];

export const OUTCOME_CHOICES: Outcome[] = [
  { kind: 'out' }, { kind: 'runs', runs: 0 }, { kind: 'runs', runs: 1 }, { kind: 'runs', runs: 2 },
  { kind: 'runs', runs: 3 }, { kind: 'runs', runs: 4 }, { kind: 'runs', runs: 6 }, { kind: 'nb' },
];

export const sameOutcome = (a: Outcome, b: Outcome) => a.kind === b.kind && (a.kind !== 'runs' || a.runs === (b as { runs: number }).runs);

/** A rule set is valid only if at least one digit means OUT, so every innings can end. */
export function isPlayable(r: RuleSet): boolean {
  return DIGITS.some((d) => r.map[d].kind === 'out');
}

export const lastDigit = (page: number): Digit => (page % 10) as Digit;

/** Book pages used for play: even pages 10..198 (19 of each last digit, so every digit is equally likely). */
export const MIN_PAGE = 10;
export const MAX_PAGE = 198;

export function pickPage(rng: Rng): number {
  const count = (MAX_PAGE - MIN_PAGE) / 2 + 1;
  return MIN_PAGE + 2 * rng.int(0, count - 1);
}

export type Side = 0 | 1;

export interface BCConfig {
  wickets: number;
  overs: number | null;
  /** A ball limit that is not whole overs (Target Challenge). Overrides overs. */
  balls?: number;
  rules: RuleSet;
}

export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  out: boolean;
}

export interface BCState {
  config: BCConfig;
  battingFirst: Side;
  innings: [Innings, Innings];
  cards: [BatterLine[], BatterLine[]];
  current: 0 | 1;
  done: boolean;
  lastPage: number | null;
  lastOutcome: Outcome | null;
  result: (MatchResult & { winnerSide: Side | null }) | null;
}

export const limitsOf = (c: BCConfig): Limits => ({ wickets: c.wickets, balls: c.balls ?? (c.overs === null ? null : c.overs * 6) });
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
export const battingSide = (st: BCState): Side => (st.current === 0 ? st.battingFirst : other(st.battingFirst));
export const targetOf = (st: BCState) => (st.current === 1 ? st.innings[0].runs + 1 : undefined);

export function newMatch(config: BCConfig, battingFirst: Side, lineups: [string[], string[]]): BCState {
  const card = (side: Side): BatterLine[] => lineups[side].slice(0, config.wickets).map((name) => ({ name, runs: 0, balls: 0, out: false }));
  const firstSide = battingFirst;
  return {
    config, battingFirst,
    innings: [newInnings(), newInnings()],
    cards: [card(firstSide), card(other(firstSide))],
    current: 0, done: false, lastPage: null, lastOutcome: null, result: null,
  };
}

/** Start straight in the chase: side 0 needs `target` runs. */
export function newChase(config: BCConfig, target: number, lineups: [string[], string[]]): BCState {
  const m = newMatch(config, 1, lineups);
  return { ...m, innings: [{ ...newInnings(), runs: target - 1, balls: config.balls ?? 0 }, newInnings()], current: 1 };
}

/** Index of the batter at the crease in the current innings. */
export function strikerIndex(st: BCState): number {
  return st.innings[st.current].wickets;
}

export function playPage(st: BCState, page: number): BCState {
  if (st.done) return st;
  const out = st.config.rules.map[lastDigit(page)];
  const ci = st.current;
  const lim = limitsOf(st.config);
  const ev = out.kind === 'out'
    ? { runs: 0, out: true, legal: true }
    : out.kind === 'nb'
      ? { runs: 1, out: false, legal: false, extra: 'nb' as const }
      : { runs: out.runs, out: false, legal: true };
  const si = strikerIndex(st);
  const innings: [Innings, Innings] = [st.innings[0], st.innings[1]];
  innings[ci] = addBall(innings[ci], { ...ev, batter: si });
  const cards: [BatterLine[], BatterLine[]] = [st.cards[0], st.cards[1]];
  cards[ci] = cards[ci].map((b, i) => (i === si ? {
    ...b,
    runs: b.runs + (out.kind === 'runs' ? out.runs : 0),
    balls: b.balls + (ev.legal ? 1 : 0),
    out: b.out || out.kind === 'out',
  } : b));
  let next: BCState = { ...st, innings, cards, lastPage: page, lastOutcome: out };
  if (inningsComplete(innings[ci], lim, targetOf(st))) {
    if (ci === 0) next = { ...next, current: 1 };
    else {
      const r = decideMatch(innings[0], innings[1], lim);
      const winnerSide = r.winner === null ? null : r.winner === 0 ? st.battingFirst : other(st.battingFirst);
      next = { ...next, done: true, result: { ...r, winnerSide } };
    }
  }
  return next;
}

/** Expected runs per legal ball for a rule set (shown on the setup screen). */
export function expectedRunsPerBall(r: RuleSet): number {
  let runs = 0;
  let legal = 0;
  for (const d of DIGITS) {
    const o = r.map[d];
    if (o.kind === 'runs') { runs += o.runs; legal += 1; }
    if (o.kind === 'out') legal += 1;
    if (o.kind === 'nb') runs += 1;
  }
  return legal === 0 ? 0 : runs / legal;
}

export const LINEUPS: Record<'bn' | 'en', [string[], string[]]> = {
  bn: [
    ['রাফি', 'তানভীর', 'সুমন', 'নাঈম', 'জামিল', 'মিরাজ', 'শুভ', 'রিয়াদ', 'আরিফ', 'পলাশ'],
    ['ইমরান', 'রনি', 'সাজিদ', 'লিটন', 'ফাহিম', 'নাসির', 'তুষার', 'বিজয়', 'রাসেল', 'অভি'],
  ],
  en: [
    ['Rafi', 'Tanvir', 'Sumon', 'Nayeem', 'Jamil', 'Miraz', 'Shuvo', 'Riyad', 'Arif', 'Palash'],
    ['Imran', 'Roni', 'Sajid', 'Liton', 'Fahim', 'Nasir', 'Tushar', 'Bijoy', 'Rasel', 'Ovi'],
  ],
};
