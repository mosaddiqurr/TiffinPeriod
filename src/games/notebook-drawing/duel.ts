import { createRng, type Rng } from '../../engine/rng';
import type { Bi } from '../../platform/i18n';
import { inkLength, type Stroke } from './paths';
import { DOODLES, PARTY_WORDS } from './words';

// Online Notebook Drawing: draw-and-guess for two. Players take turns as the drawer; each
// drawing is a round. The drawer is in charge of their round: they pick the word, run the
// clock and judge the guesses; the guesser only sends guesses. Messages (each carries g, the
// game number, and r, the round, so stale ones from an earlier game are ignored):
//   pick  { g, r, w, opts }  drawer → guesser: the word (an index in WORDS) and the guesser's choices
//   ink   { g, r, ops }      drawer → guesser: pen strokes, in batches every ~120 ms
//   guess { g, r, w }        guesser → drawer
//   end   { g, r, got, left } drawer → guesser: the round is over (both add the same points)
// Pen ops: s = new stroke { c colour, w width, p [x, y] }, p = more points [x, y, x, y…] on the
// last stroke, u = undo, x = clear the page. Points are 0…1 of the page, so any screen size matches.

export interface NDLink { send(type: string, data?: unknown): void; on(type: string, cb: (d: any) => void): () => void }
export interface NDSettings { each: number }
export type Side = 0 | 1;

export type Op = { k: 's'; c: string; w: number; p: number[] } | { k: 'p'; p: number[] } | { k: 'u' } | { k: 'x' };

/** Every word that can be drawn online: the party words and the computer's doodles. */
export const WORDS: Bi[] = (() => {
  const seen = new Set<string>();
  const out: Bi[] = [];
  for (const w of [...PARTY_WORDS, ...DOODLES.map((d) => d.word)]) if (!seen.has(w.en)) { seen.add(w.en); out.push(w); }
  return out;
})();
/** Word index → doodle index, for the words the computer has a drawing of. */
export const DOODLE_OF = new Map<number, number>(DOODLES.map((d, i) => [WORDS.findIndex((w) => w.en === d.word.en), i]));

export const PICK_SECONDS = 10;
export const DRAW_SECONDS = 70;
export const REVEAL_SECONDS = 4;
/** After a wrong guess the guesser waits this long before the next one. */
export const LOCK_SECONDS = 3;
export const OPTION_COUNT = 6;
const FLUSH_MS = 120;
const MIN_STEP = 0.8;

export const guesserPoints = (left: number) => 50 + left * 2;
export const drawerPoints = (left: number) => 40 + left;

export interface RoundEnd { r: number; word: number; got: boolean; left: number; gp: number; dp: number }

export interface NDView {
  g: number;
  r: number;
  rounds: number;
  me: Side;
  drawer: Side;
  phase: 'pick' | 'draw' | 'reveal' | 'done';
  /** The three words offered to the drawer (drawer only). */
  choices: number[];
  /** The word being drawn (−1 until chosen). The guesser's screen must not show it until the end. */
  word: number;
  /** The guesser's answers to choose from. */
  opts: number[];
  strokes: Stroke[];
  /** Wrong guesses this round (both sides see them). */
  wrong: number[];
  /** The guesser has sent the right answer and waits for the drawer to confirm. */
  sent: boolean;
  lockUntil: number;
  /** When the current pick or drawing ends (this device's clock). */
  deadline: number;
  scores: [number, number];
  last: RoundEnd | null;
  ink: number;
}

const q = (v: number) => Math.round(Math.max(0, Math.min(1, v / 200)) * 1000) / 1000;

export class NDDuel {
  private v: NDView;
  private listeners = new Set<(v: NDView) => void>();
  private offs: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushT: ReturnType<typeof setTimeout> | undefined;
  private out: Op[] = [];
  private early: Array<[string, any]> = [];
  private rng: Rng;
  private speed: number;
  private doodleOnly: boolean;
  private disposed = false;

  constructor(private link: NDLink, me: Side, settings: NDSettings, o: { speed?: number; rng?: Rng; doodleOnly?: boolean } = {}) {
    this.rng = o.rng ?? createRng();
    this.speed = o.speed ?? 1;
    this.doodleOnly = !!o.doodleOnly;
    const each = Math.max(1, Math.min(5, Math.round(settings.each)));
    this.v = {
      g: 1, r: 0, rounds: each * 2, me, drawer: 0, phase: 'pick', choices: [], word: -1, opts: [], strokes: [], wrong: [], sent: false,
      lockUntil: 0, deadline: 0, scores: [0, 0], last: null, ink: 0,
    };
    const guard = (type: string, fn: (d: any) => void) => link.on(type, (d: any) => {
      if (!d || typeof d.g !== 'number' || this.disposed) return;
      if (d.g > this.v.g) { this.early.push([type, d]); return; }
      if (d.g === this.v.g) fn(d);
    });
    this.offs.push(
      guard('pick', (d) => this.onPick(d)),
      guard('ink', (d) => this.onInk(d)),
      guard('guess', (d) => this.onGuess(d)),
      guard('end', (d) => this.onEnd(d)),
    );
    this.enterRound(0);
  }

  get view(): NDView { return this.v; }
  get iDraw() { return this.v.drawer === this.v.me; }
  onChange(cb: (v: NDView) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  dispose() { this.disposed = true; this.offs.forEach((f) => f()); this.listeners.clear(); clearTimeout(this.timer); clearTimeout(this.flushT); }

  private set(p: Partial<NDView>) { this.v = { ...this.v, ...p }; this.listeners.forEach((cb) => cb(this.v)); }
  private ms(seconds: number) { return (seconds * 1000) / this.speed; }
  private later(seconds: number, fn: () => void) { clearTimeout(this.timer); this.timer = setTimeout(() => { if (!this.disposed) fn(); }, this.ms(seconds)); }

  private pool(): number[] {
    const all = WORDS.map((_, i) => i);
    return this.doodleOnly ? all.filter((i) => DOODLE_OF.has(i)) : all;
  }
  private takeRandom(from: number[], k: number): number[] {
    const a = [...from];
    const out: number[] = [];
    while (out.length < k && a.length) out.push(a.splice(this.rng.int(0, a.length - 1), 1)[0]);
    return out;
  }

  private enterRound(r: number) {
    clearTimeout(this.timer);
    this.out = [];
    const drawer = ((r + this.v.g - 1) % 2) as Side;
    const mine = drawer === this.v.me;
    this.set({
      r, drawer, phase: 'pick', choices: mine ? this.takeRandom(this.pool(), 3) : [], word: -1, opts: [], strokes: [], wrong: [], sent: false,
      lockUntil: 0, deadline: Date.now() + this.ms(PICK_SECONDS), ink: 0,
    });
    // Time up: a word is picked for the drawer.
    if (mine) this.later(PICK_SECONDS, () => this.choose(this.rng.int(0, 2)));
  }

  /** The drawer picks one of the three words (0…2). */
  choose(i: number): boolean {
    const v = this.v;
    if (v.phase !== 'pick' || !this.iDraw || typeof v.choices[i] !== 'number') return false;
    const word = v.choices[i];
    const others = this.takeRandom(WORDS.map((_, k) => k).filter((k) => k !== word), OPTION_COUNT - 1);
    const opts = this.takeRandom([word, ...others], OPTION_COUNT);
    this.link.send('pick', { g: v.g, r: v.r, w: word, opts });
    this.startDraw(word, opts);
    return true;
  }

  private startDraw(word: number, opts: number[]) {
    this.set({ phase: 'draw', word, opts, deadline: Date.now() + this.ms(DRAW_SECONDS) });
    if (this.iDraw) this.later(DRAW_SECONDS, () => this.finish(false));
    else clearTimeout(this.timer);
  }

  private onPick(d: { r: number; w: number; opts: number[] }) {
    if (this.iDraw && d.r === this.v.r) return;
    if (d.r < this.v.r || (d.r === this.v.r && this.v.phase !== 'pick')) return;
    // The drawer moved on while this side was still showing the last answer.
    if (d.r > this.v.r) { if (d.r >= this.v.rounds) return; this.enterRound(d.r); if (this.iDraw) return; }
    if (typeof d.w !== 'number' || !WORDS[d.w] || !Array.isArray(d.opts)) return;
    const opts = d.opts.filter((k) => typeof k === 'number' && WORDS[k]).slice(0, OPTION_COUNT);
    if (!opts.includes(d.w)) opts.push(d.w);
    this.startDraw(d.w, opts);
  }

  // ----- Pen (drawer) -----

  private apply(op: Op) {
    const v = this.v;
    let strokes = v.strokes;
    if (op.k === 's') {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < op.p.length; i += 2) pts.push([op.p[i] * 200, op.p[i + 1] * 200]);
      if (!pts.length) return;
      strokes = [...strokes, { color: op.c, w: op.w, pts }];
    }
    else if (op.k === 'p') {
      const last = strokes[strokes.length - 1];
      if (!last) return;
      const pts = [...last.pts];
      for (let i = 0; i + 1 < op.p.length; i += 2) pts.push([op.p[i] * 200, op.p[i + 1] * 200]);
      strokes = [...strokes.slice(0, -1), { ...last, pts }];
    } else if (op.k === 'u') strokes = strokes.slice(0, -1);
    else strokes = [];
    this.v = { ...v, strokes, ink: op.k === 'p' || op.k === 's' ? v.ink + this.added(v.strokes, strokes) : inkLength(strokes) };
  }
  private added(before: Stroke[], after: Stroke[]): number {
    const a = after[after.length - 1];
    if (!a) return 0;
    const b = before.length === after.length ? before[before.length - 1] : null;
    let s = 0;
    for (let i = Math.max(1, b ? b.pts.length : 1); i < a.pts.length; i++) s += Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1]);
    return s;
  }
  private push(op: Op) {
    const last = this.out[this.out.length - 1];
    if (op.k === 'p' && last && (last.k === 'p' || last.k === 's')) last.p.push(...op.p);
    else this.out.push(op.k === 'p' || op.k === 's' ? { ...op, p: [...op.p] } as Op : op);
    if (!this.flushT) this.flushT = setTimeout(() => this.flush(), FLUSH_MS / this.speed);
  }
  private flush() {
    clearTimeout(this.flushT);
    this.flushT = undefined;
    if (!this.out.length) return;
    const ops = this.out;
    this.out = [];
    this.link.send('ink', { g: this.v.g, r: this.v.r, ops });
  }
  private canDraw() { return this.v.phase === 'draw' && this.iDraw; }

  /** Pen down at a page point (0…200). */
  begin(color: string, w: number, x: number, y: number) {
    if (!this.canDraw()) return;
    const op: Op = { k: 's', c: color, w: Math.round(w * 10) / 10, p: [q(x), q(y)] };
    this.apply(op); this.push(op); this.set({});
  }
  /** The pen moves (points closer than a step to the last one are skipped). */
  point(x: number, y: number) {
    if (!this.canDraw()) return;
    const last = this.v.strokes[this.v.strokes.length - 1];
    if (!last) return;
    const [lx, ly] = last.pts[last.pts.length - 1];
    const nx = q(x), ny = q(y);
    if (Math.hypot(nx * 200 - lx, ny * 200 - ly) < MIN_STEP) return;
    const op: Op = { k: 'p', p: [nx, ny] };
    this.apply(op); this.push(op); this.set({});
  }
  undo() { if (!this.canDraw() || !this.v.strokes.length) return; const op: Op = { k: 'u' }; this.apply(op); this.push(op); this.set({}); }
  clear() { if (!this.canDraw() || !this.v.strokes.length) return; const op: Op = { k: 'x' }; this.apply(op); this.push(op); this.set({}); }

  private onInk(d: { r: number; ops: Op[] }) {
    if (this.iDraw || d.r !== this.v.r || this.v.phase !== 'draw' || !Array.isArray(d.ops)) return;
    for (const op of d.ops) {
      if (!op || typeof op !== 'object') continue;
      if ((op.k === 's' || op.k === 'p') && !(Array.isArray(op.p) && op.p.every((n) => typeof n === 'number' && n >= 0 && n <= 1))) continue;
      if (op.k === 's' && (typeof op.c !== 'string' || typeof op.w !== 'number')) continue;
      if (op.k === 's' || op.k === 'p' || op.k === 'u' || op.k === 'x') this.apply(op);
    }
    this.set({});
  }

  // ----- Guessing -----

  /** Is the guesser waiting after a wrong guess? */
  locked(now = Date.now()) { return now < this.v.lockUntil; }

  /** The guesser picks an answer. Returns false when it can't be sent now. */
  guess(w: number): boolean {
    const v = this.v;
    if (v.phase !== 'draw' || this.iDraw || v.sent || this.locked() || v.wrong.includes(w) || !v.opts.includes(w)) return false;
    this.link.send('guess', { g: v.g, r: v.r, w });
    if (w === v.word) this.set({ sent: true });
    else this.set({ wrong: [...v.wrong, w], lockUntil: Date.now() + this.ms(LOCK_SECONDS) });
    return true;
  }

  private onGuess(d: { r: number; w: number }) {
    const v = this.v;
    if (!this.iDraw || d.r !== v.r || v.phase !== 'draw') return;
    if (d.w === v.word) this.finish(true);
    else if (typeof d.w === 'number' && WORDS[d.w] && !v.wrong.includes(d.w)) this.set({ wrong: [...v.wrong, d.w] });
  }

  /** Drawer: the round is over (guessed, or time up). */
  private finish(got: boolean) {
    const v = this.v;
    if (!this.iDraw || v.phase !== 'draw') return;
    const left = Math.max(0, Math.min(DRAW_SECONDS, Math.ceil(((v.deadline - Date.now()) * this.speed) / 1000)));
    this.flush();
    this.link.send('end', { g: v.g, r: v.r, got, left });
    this.endRound(got, left);
  }

  private onEnd(d: { r: number; got: boolean; left: number }) {
    if (this.iDraw || d.r !== this.v.r || this.v.phase !== 'draw') return;
    const left = Math.max(0, Math.min(DRAW_SECONDS, Math.round(Number(d.left) || 0)));
    this.endRound(!!d.got, left);
  }

  private endRound(got: boolean, left: number) {
    const v = this.v;
    const gp = got ? guesserPoints(left) : 0;
    const dp = got ? drawerPoints(left) : 0;
    const scores: [number, number] = [...v.scores];
    scores[v.drawer] += dp;
    scores[(1 - v.drawer) as Side] += gp;
    this.set({ phase: 'reveal', scores, last: { r: v.r, word: v.word, got, left, gp, dp }, sent: false });
    this.later(REVEAL_SECONDS, () => {
      if (this.v.r + 1 >= this.v.rounds) this.set({ phase: 'done' });
      else this.enterRound(this.v.r + 1);
    });
  }

  /** Both agreed to a rematch: a new game; the other player draws first this time. */
  restart() {
    clearTimeout(this.timer);
    clearTimeout(this.flushT);
    this.flushT = undefined;
    this.v = { ...this.v, g: this.v.g + 1, scores: [0, 0], last: null };
    this.enterRound(0);
    const g = this.v.g;
    const held = this.early.filter(([, d]) => d.g === g);
    this.early = this.early.filter(([, d]) => d.g > g);
    const handlers: Record<string, (d: any) => void> = { pick: (d) => this.onPick(d), ink: (d) => this.onInk(d), guess: (d) => this.onGuess(d), end: (d) => this.onEnd(d) };
    held.forEach(([type, d]) => handlers[type]?.(d));
  }

  /** Who won: 0, 1 or null for a draw (once the game is done). */
  winner(): Side | null { const [a, b] = this.v.scores; return a === b ? null : a > b ? 0 : 1; }
}
