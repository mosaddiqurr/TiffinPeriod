import type { Rng } from '../../engine/rng';
import { ANTICIPATION_MS } from '../../engine/timing';
import type { Item } from './items';

// Pakhir Ure game engine. Pure logic: time is passed in, so tests can drive it.
//
// Traditional input ("lift"): every player keeps a finger on the bench.
// The caller says "<name> ure!". If the thing flies, LIFT the finger fast.
// If it does not fly, keep the finger down.
// Simple input ("tap"): tap when the thing flies; do nothing otherwise.

export type InputStyle = 'lift' | 'tap';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Phase = 'ready' | 'gap' | 'call' | 'reveal' | 'over';

export interface Feedback {
  ok: boolean;
  reason: 'lifted' | 'held' | 'missed' | 'fooled' | 'early';
  rt?: number;
  points: number;
}

export interface Player {
  ai: boolean;
  score: number;
  lives: number;
  streak: number;
  bestStreak: number;
  holding: boolean;
  correct: number;
  wrong: number;
  rts: number[];
  judged: boolean;
  early: boolean;
  feedback: Feedback | null;
  aiLiftAt: number | null;
}

export interface EngineConfig {
  players: Array<{ ai: boolean }>;
  input: InputStyle;
  /** Solo survival uses lives. Versus uses a fixed number of calls. */
  lives: number | null;
  calls: number | null;
  aiDifficulty: Difficulty;
  /** Extra answer time (ms) for this device, e.g. a touch screen. */
  extraMs?: number;
  /**
   * How late a lift may be reported (ms). The touch pad confirms a lift a moment after the finger
   * leaves (to ignore contact flickers) and reports the real time; the call waits this long
   * before it is judged, so a lift just inside the window still counts.
   */
  settleMs?: number;
}

/** How the computer player answers at each level (also used by the online stand-in). */
export const AI_PROFILE: Record<Difficulty, { mean: number; sd: number; err: number; trickyErr: number }> = {
  easy: { mean: 640, sd: 110, err: 0.08, trickyErr: 0.35 },
  medium: { mean: 520, sd: 85, err: 0.05, trickyErr: 0.2 },
  hard: { mean: 430, sd: 65, err: 0.02, trickyErr: 0.1 },
};

export class PakhirEngine {
  phase: Phase = 'ready';
  players: Player[];
  item: Item | null = null;
  callIndex = 0;
  callAt = 0;
  windowMs = 1500;
  private gapEnd = 0;
  private revealEnd = 0;
  private lastIds: string[] = [];
  /** Changes whenever something visible changes; the UI uses it to re-render. */
  version = 0;
  events: Array<{ type: 'call' | 'correct' | 'wrong' | 'over'; player?: number }> = [];

  constructor(public cfg: EngineConfig, private items: Item[], private rng: Rng) {
    this.players = cfg.players.map((p) => ({
      ai: p.ai, score: 0, lives: cfg.lives ?? 0, streak: 0, bestStreak: 0, holding: p.ai || cfg.input === 'tap',
      correct: 0, wrong: 0, rts: [], judged: false, early: false, feedback: null, aiLiftAt: null,
    }));
  }

  /** Level grows every 6 calls: 1 = clear animals, 2 = adds tricky ones, 3+ = adds things and more speed. */
  get level(): number {
    return 1 + Math.floor(this.callIndex / 6);
  }

  /** The response window shrinks with each call, down to a floor. */
  static windowFor(callIndex: number): number {
    return Math.max(700, 1500 - callIndex * 35);
  }

  private pool(): Item[] {
    const lv = this.level;
    return this.items.filter((it) => (lv >= 2 || !it.tricky) && (lv >= 3 || it.kind === 'animal'));
  }

  private nextItem(): Item {
    // Keep about half flyers so that guessing does not pay. Avoid recent repeats.
    const pool = this.pool().filter((it) => !this.lastIds.includes(it.id));
    const wantFly = this.rng.chance(0.5);
    const side = pool.filter((it) => it.flies === wantFly);
    const it = this.rng.pick(side.length ? side : pool);
    this.lastIds.push(it.id);
    if (this.lastIds.length > 8) this.lastIds.shift();
    return it;
  }

  private bump() {
    this.version++;
  }

  allReady(): boolean {
    return this.players.every((p) => p.holding);
  }

  tick(now: number) {
    switch (this.phase) {
      case 'ready':
        if (this.allReady()) {
          this.phase = 'gap';
          const base = (this.cfg.aiDifficulty === 'hard' ? 650 : 800) + Math.min(300, this.cfg.extraMs ?? 0);
          this.gapEnd = now + base + this.rng.int(0, 700);
          this.players.forEach((p) => { p.early = false; p.feedback = null; p.judged = false; });
          this.bump();
        }
        break;
      case 'gap':
        if (now >= this.gapEnd) this.startCall(now);
        break;
      case 'call': {
        for (const [i, p] of this.players.entries()) {
          if (p.ai && !p.judged && p.aiLiftAt !== null && now >= p.aiLiftAt) this.react(i, now);
        }
        if (now >= this.callAt + this.windowMs + (this.cfg.settleMs ?? 0)) this.resolve(now);
        break;
      }
      case 'reveal':
        if (now >= this.revealEnd) {
          if (this.isOver()) {
            this.phase = 'over';
            this.events.push({ type: 'over' });
          } else {
            this.phase = 'ready';
            this.players.forEach((p) => { if (p.ai) p.holding = true; });
          }
          this.bump();
        }
        break;
    }
  }

  private startCall(now: number) {
    this.item = this.nextItem();
    this.windowMs = PakhirEngine.windowFor(this.callIndex) + (this.cfg.extraMs ?? 0);
    this.callAt = now;
    this.phase = 'call';
    const prof = AI_PROFILE[this.cfg.aiDifficulty];
    for (const p of this.players) {
      if (!p.ai) continue;
      const errP = this.item.tricky ? prof.trickyErr : prof.err;
      const wrong = this.rng.chance(errP);
      const lift = this.item.flies !== wrong;
      const rt = Math.max(250, prof.mean + this.rng.gauss() * prof.sd);
      p.aiLiftAt = lift ? now + Math.min(rt, this.windowMs - 30) : null;
    }
    this.events.push({ type: 'call' });
    // A player who lifted during the wait is judged at once.
    this.players.forEach((p, i) => { if (p.early) this.judge(i, { ok: false, reason: 'early', points: 0 }); });
    this.bump();
  }

  /** A player put the finger down (lift style) or tapped (tap style). */
  press(i: number, now: number) {
    const p = this.players[i];
    if (this.cfg.input === 'tap') {
      this.react(i, now);
      return;
    }
    p.holding = true;
    this.bump();
  }

  /** A player lifted the finger (lift style only). */
  release(i: number, now: number) {
    if (this.cfg.input === 'tap') return;
    const p = this.players[i];
    if (!p.holding) return;
    p.holding = false;
    this.react(i, now);
    this.bump();
  }

  private react(i: number, now: number) {
    const p = this.players[i];
    if (this.phase === 'gap') {
      // Lifting before the call is a false start.
      if (!p.early) { p.early = true; }
      return;
    }
    if (this.phase !== 'call' || p.judged || !this.item) return;
    const rt = now - this.callAt;
    if (rt > this.windowMs) return; // too late: judged as missed when the call ends
    if (p.early || rt < ANTICIPATION_MS) {
      this.judge(i, { ok: false, reason: 'early', points: 0 });
    } else if (this.item.flies) {
      const span = this.windowMs - ANTICIPATION_MS;
      const bonus = Math.max(0, Math.round((1 - (rt - ANTICIPATION_MS) / span) * 100));
      const mult = p.streak >= 9 ? 2 : p.streak >= 4 ? 1.5 : 1;
      p.rts.push(rt);
      this.judge(i, { ok: true, reason: 'lifted', rt, points: Math.round((100 + bonus) * mult) });
    } else {
      this.judge(i, { ok: false, reason: 'fooled', rt, points: 0 });
    }
  }

  private judge(i: number, fb: Feedback) {
    const p = this.players[i];
    p.judged = true;
    p.feedback = fb;
    if (fb.ok) {
      p.correct++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak); p.score += fb.points;
      this.events.push({ type: 'correct', player: i });
    } else {
      p.wrong++; p.streak = 0;
      if (this.cfg.lives !== null) p.lives = Math.max(0, p.lives - 1);
      else p.score = Math.max(0, p.score - 50);
      this.events.push({ type: 'wrong', player: i });
    }
    this.bump();
  }

  private resolve(now: number) {
    if (!this.item) return;
    for (const [i, p] of this.players.entries()) {
      if (p.judged) continue;
      if (p.early) this.judge(i, { ok: false, reason: 'early', points: 0 });
      else if (this.item.flies) this.judge(i, { ok: false, reason: 'missed', points: 0 });
      else {
        const mult = p.streak >= 9 ? 2 : p.streak >= 4 ? 1.5 : 1;
        this.judge(i, { ok: true, reason: 'held', points: Math.round(50 * mult) });
      }
    }
    this.callIndex++;
    this.phase = 'reveal';
    // A touch screen also gets a longer look at the answer before the next call.
    const extra = Math.min(500, this.cfg.extraMs ?? 0);
    this.revealEnd = now + (this.item.tricky ? 1700 : 950) + extra;
    this.bump();
  }

  isOver(): boolean {
    if (this.cfg.lives !== null) return this.players.some((p) => !p.ai && p.lives <= 0);
    return this.cfg.calls !== null && this.callIndex >= this.cfg.calls;
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
