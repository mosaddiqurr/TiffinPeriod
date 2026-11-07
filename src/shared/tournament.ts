import { createRng, type Rng } from '../engine/rng';
import { readJSON, writeJSON } from '../platform/storage';
import { ratingOf, teamsFor, type Sport } from './teams';

// A cup with two groups of four and a knockout: semi-finals and a final.
// The player's team plays three group matches, a semi-final and the final
// (five matches, like a school cup). Other matches are simulated from team strength.
// The tournament is plain data, so it can be saved, resumed and later sent over a network.

export type Stage = 'group' | 'sf' | 'final';

export interface Fixture {
  id: string;
  stage: Stage;
  group?: 'A' | 'B';
  /** Group matchday 1–3 (0 for knockouts). */
  day: number;
  home: string;
  away: string;
  played: boolean;
  /** Runs or goals. */
  score?: [number, number];
  /** Legal balls faced (cricket, for net run rate). */
  balls?: [number, number];
  winner?: string | null;
  /** A short note, for example "4–3 on penalties" or "Super over". */
  note?: string;
}

export interface Tournament {
  v: 1;
  sport: Sport;
  game: string;
  player: string;
  teams: string[];
  groups: { A: string[]; B: string[] };
  fixtures: Fixture[];
  /** Balls per innings (cricket) for net run rate. */
  ballsPerInnings: number;
  status: 'playing' | 'won' | 'out';
  champion?: string;
  seed: number;
}

export interface Row { team: string; p: number; w: number; d: number; l: number; pts: number; gf: number; ga: number; nrr: number }

export interface SimResult { score: [number, number]; winner: string | null; balls?: [number, number]; note?: string }
export type Simulator = (home: string, away: string, rng: Rng, knockout: boolean) => SimResult;

const PAIRS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

export function createTournament(game: string, sport: Sport, player: string, ballsPerInnings = 0, seed = (Math.random() * 2 ** 31) >>> 0): Tournament {
  const rng = createRng(seed);
  const pool = teamsFor(sport).filter((t) => t.id !== player).sort((a, b) => ratingOf(b, sport) - ratingOf(a, sport));
  // Seven opponents: a mix of strong and weaker teams.
  const strong = pool.slice(0, 7);
  const rest = pool.slice(7);
  const picked = [...strong.slice(0, 5), ...shuffle(rest.length ? rest : strong.slice(5), rng).slice(0, 2)];
  while (picked.length < 7) picked.push(pool[picked.length]);
  const others = shuffle(picked.map((t) => t.id), rng);
  const A = [player, others[0], others[1], others[2]];
  const B = [others[3], others[4], others[5], others[6]];
  const fixtures: Fixture[] = [];
  (['A', 'B'] as const).forEach((g) => {
    const teams = g === 'A' ? A : B;
    PAIRS.forEach((day, d) => day.forEach(([a, b], k) => {
      fixtures.push({ id: `${g}${d + 1}${k}`, stage: 'group', group: g, day: d + 1, home: teams[a], away: teams[b], played: false });
    }));
  });
  return { v: 1, sport, game, player, teams: [...A, ...B], groups: { A, B }, fixtures, ballsPerInnings, status: 'playing', seed };
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = rng.int(0, i); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export function standings(t: Tournament, g: 'A' | 'B'): Row[] {
  const rows = new Map<string, Row & { rf: number; bf: number; ra: number; bb: number }>();
  for (const team of t.groups[g]) rows.set(team, { team, p: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, nrr: 0, rf: 0, bf: 0, ra: 0, bb: 0 });
  const winPts = t.sport === 'cricket' ? 2 : 3;
  for (const f of t.fixtures) {
    if (f.stage !== 'group' || f.group !== g || !f.played || !f.score) continue;
    const h = rows.get(f.home)!, a = rows.get(f.away)!;
    h.p++; a.p++;
    h.gf += f.score[0]; h.ga += f.score[1]; a.gf += f.score[1]; a.ga += f.score[0];
    if (f.balls) {
      h.rf += f.score[0]; h.bf += f.balls[0]; h.ra += f.score[1]; h.bb += f.balls[1];
      a.rf += f.score[1]; a.bf += f.balls[1]; a.ra += f.score[0]; a.bb += f.balls[0];
    }
    if (f.winner === f.home) { h.w++; h.pts += winPts; a.l++; }
    else if (f.winner === f.away) { a.w++; a.pts += winPts; h.l++; }
    else { h.d++; a.d++; h.pts += 1; a.pts += 1; }
  }
  const out = [...rows.values()].map((r) => ({
    ...r,
    nrr: r.bf && r.bb ? Math.round(((r.rf / r.bf) * 6 - (r.ra / r.bb) * 6) * 1000) / 1000 : 0,
  }));
  out.sort((x, y) => y.pts - x.pts || (t.sport === 'cricket' ? y.nrr - x.nrr : (y.gf - y.ga) - (x.gf - x.ga)) || y.gf - x.gf || y.w - x.w || x.team.localeCompare(y.team));
  return out.map(({ team, p, w, d, l, pts, gf, ga, nrr }) => ({ team, p, w, d, l, pts, gf, ga, nrr }));
}

/** The player's next match, or null when the cup is over for the player. */
export function nextFixture(t: Tournament): Fixture | null {
  if (t.status !== 'playing') return null;
  return t.fixtures.find((f) => !f.played && (f.home === t.player || f.away === t.player)) ?? null;
}

export function stageOf(t: Tournament): Stage | 'done' {
  const f = t.fixtures.find((x) => !x.played);
  return f ? f.stage : 'done';
}

/** Save the player's result and simulate the rest of that round. Returns a new tournament. */
export function playerResult(t: Tournament, fixtureId: string, r: SimResult, sim: Simulator): Tournament {
  const rng = createRng((t.seed + t.fixtures.filter((f) => f.played).length * 7919) >>> 0);
  let fixtures = t.fixtures.map((f) => (f.id === fixtureId ? { ...f, played: true, score: r.score, balls: r.balls, winner: r.winner, note: r.note } : f));
  const done = fixtures.find((f) => f.id === fixtureId)!;
  // Simulate the other matches of the same round.
  fixtures = fixtures.map((f) => {
    if (f.played || f.stage !== done.stage || f.day !== done.day) return f;
    const s = sim(f.home, f.away, rng, f.stage !== 'group');
    return { ...f, played: true, score: s.score, balls: s.balls, winner: s.winner, note: s.note };
  });
  let next: Tournament = { ...t, fixtures };
  next = advance(next, sim, rng);
  return next;
}

function advance(t: Tournament, sim: Simulator, rng: Rng): Tournament {
  const groupDone = t.fixtures.filter((f) => f.stage === 'group').every((f) => f.played);
  let fixtures = t.fixtures;
  if (groupDone && !fixtures.some((f) => f.stage === 'sf')) {
    const A = standings(t, 'A'), B = standings(t, 'B');
    fixtures = [...fixtures,
      { id: 'SF1', stage: 'sf', day: 0, home: A[0].team, away: B[1].team, played: false },
      { id: 'SF2', stage: 'sf', day: 0, home: B[0].team, away: A[1].team, played: false }];
    const playerIn = [A[0], A[1], B[0], B[1]].some((r) => r.team === t.player);
    if (!playerIn) return finishWithout({ ...t, fixtures, status: 'out' }, sim, rng);
  }
  const sfs = fixtures.filter((f) => f.stage === 'sf');
  if (sfs.length === 2 && sfs.every((f) => f.played) && !fixtures.some((f) => f.stage === 'final')) {
    fixtures = [...fixtures, { id: 'F', stage: 'final', day: 0, home: sfs[0].winner!, away: sfs[1].winner!, played: false }];
    if (sfs[0].winner !== t.player && sfs[1].winner !== t.player) return finishWithout({ ...t, fixtures, status: 'out' }, sim, rng);
  }
  const fin = fixtures.find((f) => f.stage === 'final');
  if (fin?.played) return { ...t, fixtures, status: fin.winner === t.player ? 'won' : 'out', champion: fin.winner ?? undefined };
  return { ...t, fixtures };
}

/** The player is out: simulate the rest of the cup so the bracket shows a champion. */
function finishWithout(t: Tournament, sim: Simulator, rng: Rng): Tournament {
  let cur = t;
  for (let guard = 0; guard < 6; guard++) {
    const open = cur.fixtures.filter((f) => !f.played);
    if (!open.length) break;
    const fixtures = cur.fixtures.map((f) => {
      if (f.played) return f;
      const s = sim(f.home, f.away, rng, true);
      return { ...f, played: true, score: s.score, balls: s.balls, winner: s.winner, note: s.note };
    });
    cur = { ...cur, fixtures };
    const sfs = cur.fixtures.filter((f) => f.stage === 'sf');
    if (sfs.length === 2 && sfs.every((f) => f.played) && !cur.fixtures.some((f) => f.stage === 'final')) {
      cur = { ...cur, fixtures: [...cur.fixtures, { id: 'F', stage: 'final', day: 0, home: sfs[0].winner!, away: sfs[1].winner!, played: false }] };
    }
  }
  const fin = cur.fixtures.find((f) => f.stage === 'final');
  return { ...cur, status: 'out', champion: fin?.winner ?? undefined };
}

// ---------- Saving ----------
export const loadTournament = (game: string): Tournament | null => {
  const t = readJSON<Tournament | null>(`tour.${game}`, null);
  return t && t.v === 1 ? t : null;
};
export const saveTournament = (t: Tournament | null, game: string) => writeJSON(`tour.${game}`, t);

// ---------- Simulators from team strength ----------

/** Cricket: each side's innings is drawn around a par score that grows with strength. */
export function cricketSimulator(sport: Sport, ballsPerInnings: number, parPerBall: number, wickets: number): Simulator {
  return (home, away, rng, knockout) => {
    const rh = ratingOf(teamsFor(sport).find((t) => t.id === home)!, sport);
    const ra = ratingOf(teamsFor(sport).find((t) => t.id === away)!, sport);
    const inn = (r: number, opp: number) => {
      const par = ballsPerInnings * parPerBall * (0.75 + 0.05 * (r - opp) + 0.25 * rng.next() + 0.12 * rng.gauss());
      const runs = Math.max(3, Math.round(par));
      const out = rng.chance(0.55);
      return { runs, balls: out ? Math.max(4, Math.round(ballsPerInnings * rng.range(0.55, 0.98))) : ballsPerInnings, wk: out ? wickets : rng.int(0, wickets - 1) };
    };
    const a = inn(rh, ra), b = inn(ra, rh);
    if (a.runs === b.runs && knockout) {
      const hw = rng.chance(0.5 + (rh - ra) * 0.04);
      return { score: [a.runs, b.runs], balls: [a.balls, b.balls], winner: hw ? home : away, note: 'super' };
    }
    return { score: [a.runs, b.runs], balls: [a.balls, b.balls], winner: a.runs > b.runs ? home : b.runs > a.runs ? away : null };
  };
}

/** Football: goals are Poisson draws whose mean depends on the strength gap. */
export function footballSimulator(): Simulator {
  const poisson = (rng: Rng, lambda: number) => { let k = 0, p = 1; const L = Math.exp(-lambda); do { k++; p *= rng.next(); } while (p > L && k < 12); return k - 1; };
  return (home, away, rng, knockout) => {
    const teams = teamsFor('football');
    const rh = ratingOf(teams.find((t) => t.id === home)!, 'football');
    const ra = ratingOf(teams.find((t) => t.id === away)!, 'football');
    const gh = poisson(rng, Math.max(0.3, 1.3 + (rh - ra) * 0.18));
    const ga = poisson(rng, Math.max(0.3, 1.3 + (ra - rh) * 0.18));
    if (gh === ga && knockout) {
      const ph = 3 + rng.int(0, 2), pa = ph + (rng.chance(0.5 + (ra - rh) * 0.04) ? 1 : -1);
      const [x, y] = pa < ph ? [ph, pa] : [ph, pa];
      return { score: [gh, ga], winner: x > y ? home : away, note: `pens:${x}-${y}` };
    }
    return { score: [gh, ga], winner: gh > ga ? home : ga > gh ? away : null };
  };
}
