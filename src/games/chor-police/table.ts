import { createRng, type Rng } from '../../engine/rng';
import { thinkMs } from '../../platform/net/bot';
import { dealRoles, scoreChits, suspects, type Role } from './model';

// The online Chor Police table, run only by the host. It deals the chits from the seed,
// keeps the scores, runs the stand-ins and the clocks, and judges the Police's guess.
// After every change it sends each seat its own view (`CPView`): a player only ever
// receives their own chit; Babu and Police show once everyone has hidden theirs, and every
// chit shows at the reveal.
//
// Steps of a round: "read" (everyone reads and hides their chit; 20 s, then it hides
// itself) → "guess" (the Police picks one of the two suspects; 15 s, then the Police's
// current pick, or a random suspect, is taken) → "reveal" (points, then the next round
// after a few seconds). After the last round the step is "done" with the final scores.

export type CPStep = 'read' | 'guess' | 'reveal' | 'done';

export interface CPView {
  /** Game number (Play again starts the next). */
  game: number;
  rounds: number;
  round: number;
  step: CPStep;
  /** The seat this view is for. */
  seat: number;
  names: string[];
  scores: number[];
  /** What this seat may see: its own chit, Babu and Police from "guess", all at the reveal. */
  roles: Array<Role | null>;
  hidden: boolean[];
  /** Police seat from "guess" on, else -1. */
  police: number;
  guess: number | null;
  correct: boolean | null;
  points: number[] | null;
  /** The running clock at the moment of sending, in ms (null: none). */
  clock: { left: number; total: number } | null;
  /** Seats whose player left; a stand-in plays for them. */
  away: boolean[];
  /** The latest "X left" notice; `id` changes each time. */
  notice: { id: number; name: string } | null;
}

export type CPAction =
  | { g: number; r: number; kind: 'hide' }
  | { g: number; r: number; kind: 'pick'; target: number }
  | { g: number; r: number; kind: 'guess'; target: number };

export interface TableSeat { name: string; human: boolean }

export interface TableOptions {
  rounds: number;
  seed: number;
  seats: TableSeat[];
  /** Sends a view to a seat (the host's own seat included; stand-in seats may be ignored). */
  send: (seat: number, view: CPView) => void;
  readSeconds?: number;
  guessSeconds?: number;
  revealSeconds?: number;
  /** > 1 makes everything faster (tests only). */
  speed?: number;
}

export const READ_SECONDS = 20;
export const GUESS_SECONDS = 15;
export const REVEAL_SECONDS = 5;

/** The deal for a round, the same for any seed/game/round. */
export function dealFor(seed: number, game: number, round: number): Role[] {
  return dealRoles(createRng((seed ^ Math.imul(game, 0x9e3779b1) ^ Math.imul(round, 0x85ebca6b)) >>> 0).next);
}

export class ChorTable {
  private o: Required<Omit<TableOptions, 'seats'>>;
  private seats: Array<TableSeat & { away: boolean }>;
  private rng: Rng;
  private game = 0;
  private round = 1;
  private step: CPStep = 'read';
  private roles: Role[] = [];
  private scores = [0, 0, 0, 0];
  private hidden = [false, false, false, false];
  private pick: number | null = null;
  private guess: number | null = null;
  private result: { correct: boolean; points: number[] } | null = null;
  private deadline = 0;
  private total = 0;
  private epoch = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private notice: { id: number; name: string } | null = null;
  private disposed = false;

  constructor(opts: TableOptions) {
    this.o = { readSeconds: READ_SECONDS, guessSeconds: GUESS_SECONDS, revealSeconds: REVEAL_SECONDS, speed: 1, ...opts };
    this.seats = opts.seats.slice(0, 4).map((s) => ({ ...s, away: false }));
    this.rng = createRng((opts.seed ^ 0x5bd1e995) >>> 0);
  }

  /** Start a game (the first, or Play again with the seats given). */
  start(seats?: TableSeat[]) {
    if (seats) this.seats = seats.slice(0, 4).map((s) => ({ ...s, away: false }));
    this.game += 1;
    this.round = 1;
    this.scores = [0, 0, 0, 0];
    this.notice = null;
    this.deal();
  }

  /** A human's action. Out-of-date, out-of-turn or wrong-seat actions are ignored. */
  act(seat: number, a: CPAction) {
    if (this.disposed || !a || a.g !== this.game || a.r !== this.round || !this.seats[seat]?.human) return;
    this.apply(seat, a);
  }

  /** The player in `seat` left: a stand-in plays for them from now on. */
  standIn(seat: number) {
    const s = this.seats[seat];
    if (!s || !s.human) return;
    s.human = false;
    s.away = true;
    this.notice = { id: (this.notice?.id ?? 0) + 1, name: s.name };
    if (this.step === 'read' && !this.hidden[seat]) this.later(thinkMs(this.rng, 0.8, 2, this.o.speed), () => this.apply(seat, { g: this.game, r: this.round, kind: 'hide' }));
    if (this.step === 'guess' && this.roles[seat] === 'police') this.botGuess();
    this.broadcast();
  }

  get state() {
    return { game: this.game, round: this.round, step: this.step, roles: [...this.roles], scores: [...this.scores], seats: this.seats.map((s) => ({ ...s })) };
  }

  dispose() {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  // ---------- inside ----------

  private later(ms: number, fn: () => void) {
    const epoch = this.epoch;
    const id = setTimeout(() => { this.timers.delete(id); if (!this.disposed && epoch === this.epoch) fn(); }, ms);
    this.timers.add(id);
  }

  private clock(seconds: number, onExpire: () => void) {
    this.total = (seconds * 1000) / this.o.speed;
    this.deadline = Date.now() + this.total;
    this.later(this.total, onExpire);
  }

  private nextStep(step: CPStep) {
    this.epoch += 1;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.step = step;
    this.deadline = 0;
    this.total = 0;
  }

  private deal() {
    this.nextStep('read');
    this.roles = dealFor(this.o.seed, this.game, this.round);
    this.hidden = [false, false, false, false];
    this.pick = null;
    this.guess = null;
    this.result = null;
    this.seats.forEach((s, i) => {
      if (!s.human) this.later(thinkMs(this.rng, 1.2, 4, this.o.speed), () => this.apply(i, { g: this.game, r: this.round, kind: 'hide' }));
    });
    this.clock(this.o.readSeconds, () => {
      this.hidden = this.hidden.map(() => true);
      this.toGuess();
    });
    this.broadcast();
  }

  private toGuess() {
    this.nextStep('guess');
    const police = this.roles.indexOf('police');
    this.clock(this.o.guessSeconds, () => {
      const options = suspects(this.roles);
      this.judge(this.pick !== null && options.includes(this.pick) ? this.pick : this.rng.pick(options));
    });
    if (!this.seats[police].human) this.botGuess();
    this.broadcast();
  }

  /** The computer Police: thinks a little, then picks one of the two suspects. */
  private botGuess() {
    this.later(thinkMs(this.rng, 2, 5, this.o.speed), () => this.judge(this.rng.pick(suspects(this.roles))));
  }

  private apply(seat: number, a: CPAction) {
    if (a.kind === 'hide') {
      if (this.step !== 'read' || this.hidden[seat]) return;
      this.hidden[seat] = true;
      if (this.hidden.every(Boolean)) this.toGuess();
      else this.broadcast();
      return;
    }
    if (this.step !== 'guess' || this.roles[seat] !== 'police' || !suspects(this.roles).includes(a.target)) return;
    if (a.kind === 'pick') { this.pick = a.target; this.broadcast(); return; }
    this.judge(a.target);
  }

  private judge(target: number) {
    if (this.step !== 'guess') return;
    const r = scoreChits(this.roles, target);
    this.scores = this.scores.map((s, i) => s + r.points[i]);
    this.guess = target;
    this.result = r;
    if (this.round >= this.o.rounds) { this.nextStep('done'); this.broadcast(); return; }
    this.nextStep('reveal');
    this.clock(this.o.revealSeconds, () => { this.round += 1; this.deal(); });
    this.broadcast();
  }

  private view(seat: number): CPView {
    const open = this.step === 'reveal' || this.step === 'done';
    const pub = this.step !== 'read';
    return {
      game: this.game, rounds: this.o.rounds, round: this.round, step: this.step, seat,
      names: this.seats.map((s) => s.name),
      scores: [...this.scores],
      roles: this.roles.map((r, i) => (i === seat || open || (pub && (r === 'babu' || r === 'police')) ? r : null)),
      hidden: [...this.hidden],
      police: pub ? this.roles.indexOf('police') : -1,
      guess: this.guess,
      correct: this.result ? this.result.correct : null,
      points: this.result ? [...this.result.points] : null,
      clock: this.deadline ? { left: Math.max(0, this.deadline - Date.now()), total: this.total } : null,
      away: this.seats.map((s) => s.away),
      notice: this.notice,
    };
  }

  private broadcast() {
    if (this.disposed) return;
    this.seats.forEach((_, i) => this.o.send(i, this.view(i)));
  }
}
