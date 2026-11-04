// Shared cricket scoring utilities.
// Hand Cricket and Book Cricket use these. Each game keeps its own rules
// for how one ball is decided; this module only keeps the score.
// The Phase 3 cricket engine can reuse the same Innings and result types.

export interface BallEvent {
  runs: number;
  out: boolean;
  /** false for a no-ball or a wide: it does not count as one of the balls in the over. */
  legal: boolean;
  extra?: 'nb' | 'wd';
  batter?: number;
}

export interface Innings {
  runs: number;
  wickets: number;
  balls: number; // legal balls
  events: BallEvent[];
}

export interface Limits {
  wickets: number;
  /** null = no ball limit (play until all out). */
  balls: number | null;
}

export const BALLS_PER_OVER = 6;

export function newInnings(): Innings {
  return { runs: 0, wickets: 0, balls: 0, events: [] };
}

export function addBall(inn: Innings, ev: BallEvent): Innings {
  return {
    runs: inn.runs + ev.runs,
    wickets: inn.wickets + (ev.out ? 1 : 0),
    balls: inn.balls + (ev.legal ? 1 : 0),
    events: [...inn.events, ev],
  };
}

/** "2.3" means 2 overs and 3 balls. */
export function oversText(balls: number, bpo = BALLS_PER_OVER): string {
  return `${Math.floor(balls / bpo)}.${balls % bpo}`;
}

export function runRate(runs: number, balls: number, bpo = BALLS_PER_OVER): number {
  return balls === 0 ? 0 : Math.round((runs / balls) * bpo * 100) / 100;
}

export function inningsComplete(inn: Innings, lim: Limits, target?: number): boolean {
  if (inn.wickets >= lim.wickets) return true;
  if (lim.balls !== null && inn.balls >= lim.balls) return true;
  if (target !== undefined && inn.runs >= target) return true;
  return false;
}

export interface MatchResult {
  /** 0 = the side that batted first, 1 = the chasing side, null = tie. */
  winner: 0 | 1 | null;
  kind: 'runs' | 'wickets' | 'tie';
  margin: number;
}

export function decideMatch(first: Innings, second: Innings, lim: Limits): MatchResult {
  if (second.runs > first.runs) return { winner: 1, kind: 'wickets', margin: lim.wickets - second.wickets };
  if (second.runs < first.runs) return { winner: 0, kind: 'runs', margin: first.runs - second.runs };
  return { winner: null, kind: 'tie', margin: 0 };
}

/** The events of the over that is in progress (or the last full over if it just ended). */
export function currentOver(events: BallEvent[], bpo = BALLS_PER_OVER): BallEvent[] {
  let legal = 0;
  for (const e of events) if (e.legal) legal++;
  const completeOvers = Math.floor(legal / bpo);
  const startLegal = legal % bpo === 0 && legal > 0 ? (completeOvers - 1) * bpo : completeOvers * bpo;
  const out: BallEvent[] = [];
  let seen = 0;
  for (const e of events) {
    if (seen >= startLegal) out.push(e);
    if (e.legal) seen++;
  }
  return out;
}

export function ballsLeft(inn: Innings, lim: Limits): number | null {
  return lim.balls === null ? null : Math.max(0, lim.balls - inn.balls);
}
