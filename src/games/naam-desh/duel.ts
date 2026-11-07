import { createRng } from '../../engine/rng';
import { LETTERS, blankAnswers, canReview, knownWord, scoreWords, type Answers, type Letter } from './model';

// Naam Desh Ful Fol online. Each round both players get the SAME letter (from the lobby's
// seed and the game number, so nothing crosses the wire for it) and write their four answers
// at the same time on their own device. Messages (g = game number for rematches, r = round):
//   "start" { g, r }        this side has begun the round (the stand-in waits for it)
//   "done"  { g, r }        this side has closed its khata (answers locked, not sent yet)
//   "ans"   { g, r, a }     the four answers, sent only once BOTH sides are done
//   "rev"   { g, r, v }     this side's verdict on the other's four answers
// The write clock is `seconds`; when the other side is done, yours drops to LAST_SECONDS
// (if you had more). When it runs out, what you have typed is handed in.
// Known words are accepted by themselves and answers that don't start with the letter score
// 0; an unknown word that does goes to the OTHER player to accept or reject, with a
// REVIEW_SECONDS clock (anything left unchecked is accepted). Each side forces known words
// to true and wrong letters to false in what it receives, so a verdict can't break the rules.
// Both sides then score the same four lists with the game's own scoreWords (10 a word, 5
// each for the same word), so they always agree. Best total after all rounds wins.

export interface NDSettings { rounds: number; seconds: number }
export const QUICK: NDSettings = { rounds: 3, seconds: 60 };
export const LAST_SECONDS = 10;
export const REVIEW_SECONDS = 15;
export const MAX_LEN = 60;

export type NDPhase = 'write' | 'wait' | 'review' | 'between' | 'over';

export interface RoundResult {
  letter: Letter;
  /** [mine, theirs] */
  answers: [Answers, Answers];
  accepted: [boolean[], boolean[]];
  points: [number[], number[]];
}

export interface NDView {
  g: number;
  r: number;
  letter: Letter;
  phase: NDPhase;
  mine: Answers;
  /** Their answers (only once both are done). */
  theirs: Answers | null;
  theirDone: boolean;
  /** Write clock end (ms, on this side's clock). */
  deadline: number;
  /** Review clock end. */
  reviewDeadline: number;
  /** My checks on their answers (null = not decided yet). */
  checks: (boolean | null)[];
  sentReview: boolean;
  /** Their verdict on my answers. */
  theirReview: boolean[] | null;
  results: RoundResult[];
  /** Totals: [me, them]. */
  totals: [number, number];
}

export interface DuelLink {
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
}

/** The letters of game `g`, the same on both devices, all different. */
export function duelLetters(s: NDSettings, seed: number, g: number): Letter[] {
  const rng = createRng((seed ^ Math.imul(g, 0x9e3779b1)) >>> 0);
  const pool = [...LETTERS];
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.max(1, Math.min(s.rounds, pool.length)));
}

/** Which of these answers need a person to check them (unknown, but start with the letter). */
export function needsCheck(letter: Letter, a: Answers): number[] {
  return a.map((w, c) => (w.trim() && !knownWord(letter, c, w) && canReview(letter, c, w) ? c : -1)).filter((c) => c >= 0);
}

/** A verdict made legal: known words always count, wrong letters and blanks never do. */
export function fairVerdict(letter: Letter, a: Answers, v: unknown): boolean[] {
  const raw = Array.isArray(v) ? v : [];
  return a.map((w, c) => (knownWord(letter, c, w) ? true : !canReview(letter, c, w) ? false : raw[c] !== false));
}

const cleanAnswers = (a: unknown): Answers => {
  const arr = Array.isArray(a) ? a : [];
  return [0, 1, 2, 3].map((i) => (typeof arr[i] === 'string' ? (arr[i] as string).slice(0, MAX_LEN) : '')) as Answers;
};

export interface DuelOptions {
  now?: () => number;
  /** > 1 makes every clock shorter (tests and the fast stand-in only). */
  scale?: number;
}

export class NDDuel {
  private v: NDView;
  private letters: Letter[];
  private offs: Array<() => void> = [];
  private listeners = new Set<(v: NDView) => void>();
  private started = '';
  private sentAns = '';
  private theirDone = new Set<string>();
  private theirAns = new Map<string, Answers>();
  private theirRev = new Map<string, unknown>();
  private now: () => number;
  private scale: number;

  constructor(private link: DuelLink, readonly side: 0 | 1, readonly settings: NDSettings, readonly seed: number, o: DuelOptions = {}) {
    this.now = o.now ?? Date.now;
    this.scale = o.scale ?? 1;
    this.letters = duelLetters(settings, seed, 1);
    this.v = this.roundView(1, 0, [], [0, 0]);
  }

  get view() { return this.v; }
  get rounds() { return this.letters.length; }

  attach() {
    if (this.offs.length) return;
    this.offs.push(
      this.link.on('done', (d: { g: number; r: number }) => this.onDone(d)),
      this.link.on('ans', (d: { g: number; r: number; a: unknown }) => this.onAns(d)),
      this.link.on('rev', (d: { g: number; r: number; v: unknown }) => this.onRev(d)),
    );
    this.sayStart();
  }
  detach() { this.offs.forEach((f) => f()); this.offs = []; }
  dispose() { this.detach(); this.listeners.clear(); }
  onChange(cb: (v: NDView) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  private ms(seconds: number) { return (seconds * 1000) / this.scale; }
  private key(g = this.v.g, r = this.v.r) { return `${g}:${r}`; }

  /** Start this round's write clock again (the stand-in does this when the player starts). */
  startClock() {
    if (this.v.phase !== 'write') return;
    let deadline = this.now() + this.ms(this.settings.seconds);
    if (this.v.theirDone) deadline = Math.min(deadline, this.now() + this.ms(LAST_SECONDS));
    this.set({ ...this.v, deadline });
  }

  /** Seconds left on whichever clock is running now. */
  secondsLeft(): number {
    const v = this.v;
    const end = v.phase === 'write' ? v.deadline : v.phase === 'review' ? v.reviewDeadline : 0;
    return Math.max(0, ((end - this.now()) * this.scale) / 1000);
  }

  setAnswer(cat: number, text: string) {
    if (this.v.phase !== 'write' || cat < 0 || cat > 3) return;
    const mine = this.v.mine.map((s, c) => (c === cat ? text.slice(0, MAX_LEN) : s)) as Answers;
    this.set({ ...this.v, mine });
  }

  /** Close the khata: answers are locked. */
  finish(): boolean {
    const v = this.v;
    if (v.phase !== 'write') return false;
    this.set({ ...v, phase: 'wait' });
    this.link.send('done', { g: v.g, r: v.r });
    this.maybeSendAns();
    this.maybeReview();
    return true;
  }

  /** My check on one of their answers. */
  check(cat: number, ok: boolean) {
    const v = this.v;
    if (v.phase !== 'review' || v.sentReview || !v.theirs || !needsCheck(v.letter, v.theirs).includes(cat)) return;
    this.set({ ...v, checks: v.checks.map((c, i) => (i === cat ? ok : c)) });
  }

  /** Send my checks (anything left unchecked is accepted). */
  sendReview(): boolean {
    const v = this.v;
    if (v.phase !== 'review' || v.sentReview || !v.theirs) return false;
    const verdict = fairVerdict(v.letter, v.theirs, v.checks.map((c) => c ?? true));
    this.link.send('rev', { g: v.g, r: v.r, v: verdict });
    this.set({ ...v, sentReview: true });
    this.settle();
    return true;
  }

  /** Run the clocks: hand in when the write clock ends, send checks when the review clock ends. */
  tick() {
    const v = this.v;
    if (v.phase === 'write' && this.now() >= v.deadline) this.finish();
    else if (v.phase === 'review' && !v.sentReview && this.now() >= v.reviewDeadline) this.sendReview();
  }

  next() {
    const v = this.v;
    if (v.phase !== 'between') return;
    this.begin(v.g, v.r + 1, v.results, v.totals);
  }

  restart() {
    const g = this.v.g + 1;
    this.letters = duelLetters(this.settings, this.seed, g);
    this.begin(g, 0, [], [0, 0]);
  }

  private roundView(g: number, r: number, results: RoundResult[], totals: [number, number]): NDView {
    const k = `${g}:${r}`;
    const theirDone = this.theirDone.has(k);
    const now = this.now();
    let deadline = now + this.ms(this.settings.seconds);
    if (theirDone) deadline = Math.min(deadline, now + this.ms(LAST_SECONDS));
    return { g, r, letter: this.letters[r], phase: 'write', mine: blankAnswers(), theirs: null, theirDone, deadline, reviewDeadline: 0, checks: [null, null, null, null], sentReview: false, theirReview: null, results, totals };
  }

  private begin(g: number, r: number, results: RoundResult[], totals: [number, number]) {
    this.set(this.roundView(g, r, results, totals));
    this.sayStart();
  }

  private sayStart() {
    const k = this.key();
    if (this.started === k || !this.offs.length) return;
    this.started = k;
    this.link.send('start', { g: this.v.g, r: this.v.r });
  }

  private onDone(d: { g: number; r: number }) {
    if (!d || typeof d.g !== 'number' || typeof d.r !== 'number') return;
    this.theirDone.add(this.key(d.g, d.r));
    const v = this.v;
    if (d.g !== v.g || d.r !== v.r || v.theirDone) return;
    const deadline = v.phase === 'write' ? Math.min(v.deadline, this.now() + this.ms(LAST_SECONDS)) : v.deadline;
    this.set({ ...v, theirDone: true, deadline });
    this.maybeSendAns();
  }

  private onAns(d: { g: number; r: number; a: unknown }) {
    if (!d || typeof d.g !== 'number' || typeof d.r !== 'number') return;
    this.theirAns.set(this.key(d.g, d.r), cleanAnswers(d.a));
    this.maybeReview();
  }

  private onRev(d: { g: number; r: number; v: unknown }) {
    if (!d || typeof d.g !== 'number' || typeof d.r !== 'number') return;
    this.theirRev.set(this.key(d.g, d.r), d.v);
    this.settle();
  }

  private maybeSendAns() {
    const v = this.v, k = this.key();
    if (v.phase === 'write' || !v.theirDone || this.sentAns === k) return;
    this.sentAns = k;
    this.link.send('ans', { g: v.g, r: v.r, a: v.mine });
  }

  private maybeReview() {
    const v = this.v;
    const theirs = this.theirAns.get(this.key());
    if (v.phase !== 'wait' || !theirs) return;
    this.set({ ...v, phase: 'review', theirs, theirDone: true, reviewDeadline: this.now() + this.ms(REVIEW_SECONDS) });
    // Nothing to check: send the verdict straight away.
    if (!needsCheck(v.letter, theirs).length) this.sendReview();
    else this.settle();
  }

  private settle() {
    const v = this.v;
    const raw = this.theirRev.get(this.key());
    if (v.phase !== 'review' || !v.theirs || raw === undefined) return;
    const theirReview = fairVerdict(v.letter, v.mine, raw);
    if (!v.sentReview) { this.set({ ...v, theirReview }); return; }
    const mineAcc = fairVerdict(v.letter, v.theirs, v.checks.map((c) => c ?? true));
    // Score in host-first order so both sides do exactly the same sum.
    const ans: Answers[] = this.side === 0 ? [v.mine, v.theirs] : [v.theirs, v.mine];
    const acc: boolean[][] = this.side === 0 ? [theirReview, mineAcc] : [mineAcc, theirReview];
    const pts = scoreWords(v.letter, ans, acc);
    const me = this.side === 0 ? pts[0] : pts[1], them = this.side === 0 ? pts[1] : pts[0];
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const result: RoundResult = { letter: v.letter, answers: [v.mine, v.theirs], accepted: [theirReview, mineAcc], points: [me, them] };
    const totals: [number, number] = [v.totals[0] + sum(me), v.totals[1] + sum(them)];
    this.set({ ...v, theirReview, results: [...v.results, result], totals, phase: v.r + 1 >= this.letters.length ? 'over' : 'between' });
  }

  private set(v: NDView) { this.v = v; this.listeners.forEach((cb) => cb(v)); }
}

/** 1 = I win, 0 = draw, -1 = they win. */
export const matchWinner = (t: [number, number]): 1 | 0 | -1 => (t[0] === t[1] ? 0 : t[0] > t[1] ? 1 : -1);
