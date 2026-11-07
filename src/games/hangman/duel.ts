import { createRng } from '../../engine/rng';
import { guess as applyGuess, newRound, type HMState, type Script } from './model';
import { CATEGORIES, type Category } from './words';

// The online word duel. Each round both players get the SAME secret word (picked from the
// lobby's seed, so nothing secret crosses the wire) and solve it at the same time on their
// own device. After every guess a side sends its progress:
//   "prog" { g, r, shown: cluster indices filled in, wrong, status, ms, n }
// (g = game number for rematches, r = round 0–2, ms = time since the round started).
// Letters never cross the wire, so the other side can show dots but not the letters.
// "start" { g, r } says this side has begun a round (the stand-in waits for it).
//
// A round ends when both are solved or out of chances. Solving beats failing; between two
// solvers fewer wrong guesses wins, then the faster. Each round won is a point; the best
// total after 3 rounds wins. Both sides judge from the same two final "prog"s, so they agree.
// A guess clock runs out as a wrong guess (a timeout token in `wrong`, never a key).

export interface HMSettings { cat: string; script: Script; lives: number }
export const ROUNDS = 3;
export const GUESS_SECONDS = 15;
export const LIVES = 8;

export interface Prog { g: number; r: number; shown: number[]; wrong: number; status: HMState['status']; ms: number; n: number }
export interface DuelWord { word: string; cat: Category }
export interface RoundResult { word: string; cat: Category; me: Prog; them: Prog; win: 1 | 0 | -1 }
export type DuelPhase = 'play' | 'wait' | 'between' | 'over';

export interface DuelView {
  g: number;
  r: number;
  word: DuelWord;
  st: HMState;
  opp: Prog | null;
  phase: DuelPhase;
  results: RoundResult[];
  /** Rounds won: [me, them]. */
  tally: [number, number];
}

export interface DuelLink {
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
}

/** The three words of game `g`, the same on both devices. */
export function duelWords(s: HMSettings, seed: number, g: number): DuelWord[] {
  const rng = createRng((seed ^ Math.imul(g, 0x9e3779b1)) >>> 0);
  const pool = s.cat === 'any' ? CATEGORIES : CATEGORIES.filter((c) => c.id === s.cat);
  const list = pool.length ? pool : CATEGORIES;
  const out: DuelWord[] = [];
  const cats = new Set<string>();
  for (let i = 0; i < ROUNDS; i++) {
    for (let k = 0; k < 60; k++) {
      // Mixed: try to give each round a different category.
      const fresh = list.filter((c) => !cats.has(c.id));
      const c = rng.pick(fresh.length && k < 30 ? fresh : list);
      const w = rng.pick(c[s.script]);
      if (out.some((o) => o.word === w)) continue;
      out.push({ word: w, cat: c });
      cats.add(c.id);
      break;
    }
    if (out.length <= i) out.push({ word: list[0][s.script][i], cat: list[0] });
  }
  return out;
}

/** Judge a round from one side: 1 = a wins, -1 = b wins, 0 = a draw. */
export function judge(a: Prog, b: Prog): 1 | 0 | -1 {
  const sa = a.status === 'won', sb = b.status === 'won';
  if (sa !== sb) return sa ? 1 : -1;
  if (!sa) return 0;
  if (a.wrong !== b.wrong) return a.wrong < b.wrong ? 1 : -1;
  if (a.ms !== b.ms) return a.ms < b.ms ? 1 : -1;
  return 0;
}

export const isTimeout = (l: string) => l.startsWith('⏱');

export class HMDuel {
  private v: DuelView;
  private words: DuelWord[];
  private t0: number;
  private mine: Prog;
  private theirs = new Map<string, Prog>();
  private offs: Array<() => void> = [];
  private listeners = new Set<(v: DuelView) => void>();
  private started = '';

  constructor(private link: DuelLink, readonly side: 0 | 1, readonly settings: HMSettings, readonly seed: number, private now: () => number = Date.now) {
    this.words = duelWords(settings, seed, 1);
    this.t0 = now();
    const st = newRound(this.words[0].word, settings.script, settings.lives);
    this.mine = this.progOf(st, 1, 0);
    this.v = { g: 1, r: 0, word: this.words[0], st, opp: null, phase: 'play', results: [], tally: [0, 0] };
  }

  get view() { return this.v; }

  /** Start listening (and say this round has begun). Call once the match is on screen. */
  attach() {
    if (this.offs.length) return;
    this.offs.push(this.link.on('prog', (p: Prog) => this.onProg(p)));
    this.sayStart();
  }
  detach() { this.offs.forEach((f) => f()); this.offs = []; }
  dispose() { this.detach(); this.listeners.clear(); }

  onChange(cb: (v: DuelView) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  /** Restart this round's clock (the stand-in does this when the player starts). */
  startClock() { this.t0 = this.now(); }

  /** Elapsed time this round, in ms. */
  elapsed() { return Math.max(0, Math.round(this.now() - this.t0)); }

  guess(letter: string): boolean {
    const v = this.v;
    if (v.phase !== 'play') return false;
    const st = applyGuess(v.st, letter);
    if (st === v.st) return false;
    this.mine = this.progOf(st, this.mine.n + 1, this.elapsed());
    this.link.send('prog', this.mine);
    this.set({ ...v, st, phase: st.status === 'play' ? 'play' : 'wait' });
    this.settle();
    return true;
  }

  /** The guess clock ran out: it counts as one wrong guess. */
  timeout(): boolean {
    return this.guess(`⏱${this.v.st.wrong.length}`);
  }

  /** After a round both have finished: the next word. */
  next() {
    const v = this.v;
    if (v.phase !== 'between') return;
    const r = v.r + 1;
    this.beginRound(v.g, r, v.results, v.tally);
  }

  /** A rematch: a new game with three new words. */
  restart() {
    const g = this.v.g + 1;
    this.words = duelWords(this.settings, this.seed, g);
    this.beginRound(g, 0, [], [0, 0]);
  }

  private beginRound(g: number, r: number, results: RoundResult[], tally: [number, number]) {
    const word = this.words[r];
    const st = newRound(word.word, this.settings.script, this.settings.lives);
    this.t0 = this.now();
    this.mine = this.progOf(st, 0, 0);
    this.mine.g = g; this.mine.r = r;
    this.set({ g, r, word, st, opp: this.theirs.get(`${g}:${r}`) ?? null, phase: 'play', results, tally });
    this.sayStart();
    this.settle();
  }

  private sayStart() {
    const k = `${this.v.g}:${this.v.r}`;
    if (this.started === k || !this.offs.length) return;
    this.started = k;
    this.link.send('start', { g: this.v.g, r: this.v.r });
  }

  private progOf(st: HMState, n: number, ms: number): Prog {
    const shown: number[] = [];
    st.needs.forEach((need, i) => { if (need.length && need.every((l) => st.guessed.includes(l))) shown.push(i); });
    return { g: this.v?.g ?? 1, r: this.v?.r ?? 0, shown, wrong: st.wrong.length, status: st.status, ms, n };
  }

  private onProg(p: Prog) {
    if (!p || typeof p.g !== 'number' || typeof p.r !== 'number') return;
    this.theirs.set(`${p.g}:${p.r}`, p);
    const v = this.v;
    if (p.g === v.g && p.r === v.r && v.phase !== 'between' && v.phase !== 'over') {
      this.set({ ...v, opp: p });
      this.settle();
    }
  }

  /** Both done with this round: judge it. */
  private settle() {
    const v = this.v;
    const opp = v.opp;
    if (v.phase !== 'wait' || !opp || opp.status === 'play') return;
    const win = judge(this.mine, opp);
    const results = [...v.results, { word: v.st.word, cat: v.word.cat, me: this.mine, them: opp, win }];
    const tally: [number, number] = [v.tally[0] + (win === 1 ? 1 : 0), v.tally[1] + (win === -1 ? 1 : 0)];
    this.set({ ...v, results, tally, phase: v.r + 1 >= ROUNDS ? 'over' : 'between' });
  }

  private set(v: DuelView) { this.v = v; this.listeners.forEach((cb) => cb(v)); }
}

/** The match result from one side: 1 win, 0 draw, -1 loss. */
export const matchWinner = (tally: [number, number]): 1 | 0 | -1 => (tally[0] === tally[1] ? 0 : tally[0] > tally[1] ? 1 : -1);
