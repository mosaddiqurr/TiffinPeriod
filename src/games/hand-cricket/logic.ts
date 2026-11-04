import { addBall, decideMatch, inningsComplete, newInnings, type Innings, type Limits, type MatchResult } from '../../shared/cricket';

// Hand Cricket rules:
// - Each ball, the batter and the bowler each show a number from 1 to 6
//   at the same moment. Six is shown with the thumb.
// - Different numbers: the batter scores the number the batter showed.
// - Same number: the batter is OUT.
// - The second side chases the target (first innings + 1).

export type Side = 0 | 1;

export interface HCConfig {
  wickets: number;
  /** null = classic: no over limit. */
  overs: number | null;
}

export interface BallRecord {
  bat: number;
  bowl: number;
  out: boolean;
  runs: number;
}

export interface HCState {
  config: HCConfig;
  battingFirst: Side;
  innings: [Innings, Innings];
  current: 0 | 1;
  done: boolean;
  last: BallRecord | null;
  result: (MatchResult & { winnerSide: Side | null }) | null;
}

export const limitsOf = (c: HCConfig): Limits => ({ wickets: c.wickets, balls: c.overs === null ? null : c.overs * 6 });

export function newMatch(config: HCConfig, battingFirst: Side): HCState {
  return { config, battingFirst, innings: [newInnings(), newInnings()], current: 0, done: false, last: null, result: null };
}

export const other = (s: Side): Side => (s === 0 ? 1 : 0);
export const battingSide = (st: HCState): Side => (st.current === 0 ? st.battingFirst : other(st.battingFirst));
export const bowlingSide = (st: HCState): Side => other(battingSide(st));
export const targetOf = (st: HCState): number | undefined => (st.current === 1 ? st.innings[0].runs + 1 : undefined);

export function isValidPick(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

export function judgeBall(bat: number, bowl: number): BallRecord {
  const out = bat === bowl;
  return { bat, bowl, out, runs: out ? 0 : bat };
}

/** Play one ball. Returns a new state. The input state is not changed. */
export function playBall(st: HCState, bat: number, bowl: number): HCState {
  if (st.done) return st;
  if (!isValidPick(bat) || !isValidPick(bowl)) throw new Error('Pick must be 1..6');
  const rec = judgeBall(bat, bowl);
  const lim = limitsOf(st.config);
  const innings: [Innings, Innings] = [st.innings[0], st.innings[1]];
  innings[st.current] = addBall(innings[st.current], { runs: rec.runs, out: rec.out, legal: true });
  let next: HCState = { ...st, innings, last: rec };
  if (inningsComplete(innings[st.current], lim, targetOf(st))) {
    if (st.current === 0) {
      next = { ...next, current: 1 };
    } else {
      const r = decideMatch(innings[0], innings[1], lim);
      const winnerSide = r.winner === null ? null : r.winner === 0 ? st.battingFirst : other(st.battingFirst);
      next = { ...next, done: true, result: { ...r, winnerSide } };
    }
  }
  return next;
}

/** Toss by odd/even: the caller wins if the parity of the sum matches the call. */
export function tossWinner(caller: Side, call: 'odd' | 'even', a: number, b: number): Side {
  const sumOdd = (a + b) % 2 === 1;
  const callerWins = (call === 'odd') === sumOdd;
  return callerWins ? caller : other(caller);
}
