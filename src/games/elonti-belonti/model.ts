import type { Rng } from '../../engine/rng';

// Elonti Belonti model (pure).
// The caller faces the tree and chants. While the caller chants, players may
// walk. At the last word the caller turns. Anyone still moving after the turn
// is caught and goes back to the start. Stopping takes a moment, so players
// must stop a little before the chant ends.

export const CHANT_BN = ['এলন্টি', 'বেলন্টি', 'ঘড়ি', 'বাজে', 'টিং', 'টিং', 'এক', 'দুই', 'তিন!'];
export const CHANT_EN = ['Elonti', 'Belonti', 'ghori', 'baje', 'ting', 'ting', 'ek', 'dui', 'tin!'];
export const WALK = { accel: 650, decel: 560, vmax: 140, still: 6, turn: 0.2 };

export type CallerState = 'chant' | 'turning' | 'watch' | 'back';

export class Caller {
  state: CallerState = 'chant';
  word = 0;
  wordT = 0;
  wordDur = 0.4;
  stateT = 0;
  watchFor = 1.6;
  /** Counts chants, so the computer can decide once per chant. */
  round = 0;
  /** A short pause before "ek dui tin" in some rounds (a trick). */
  private pauseBefore = -1;
  constructor(private rng: Rng) {
    this.newChant();
  }
  private newChant() {
    this.round++;
    this.word = 0;
    this.wordT = 0;
    this.wordDur = this.rng.range(0.22, 0.55);
    this.pauseBefore = this.rng.chance(0.35) ? 6 : -1;
  }
  /** Returns events: 'word' (new word), 'turned' (now watching), 'away' (chant again). */
  update(dt: number): 'word' | 'turned' | 'away' | null {
    this.stateT += dt;
    if (this.state === 'chant') {
      this.wordT += dt;
      const dur = this.word === this.pauseBefore ? this.wordDur + 0.55 : this.wordDur;
      if (this.wordT >= dur) {
        this.wordT = 0;
        this.word++;
        if (this.word >= CHANT_BN.length) { this.state = 'turning'; this.stateT = 0; this.word = CHANT_BN.length - 1; return null; }
        return 'word';
      }
    } else if (this.state === 'turning' && this.stateT >= WALK.turn) {
      this.state = 'watch'; this.stateT = 0; this.watchFor = this.rng.range(1.2, 2.4); return 'turned';
    } else if (this.state === 'watch' && this.stateT >= this.watchFor) {
      this.state = 'back'; this.stateT = 0;
    } else if (this.state === 'back' && this.stateT >= WALK.turn) {
      this.state = 'chant'; this.stateT = 0; this.newChant(); return 'away';
    }
    return null;
  }
  /** Seconds left until the caller starts to turn (only while chanting). */
  timeLeft(): number {
    if (this.state !== 'chant') return 0;
    const left = CHANT_BN.length - this.word;
    return left * this.wordDur - this.wordT;
  }
}

export interface Walker { x: number; v: number; hold: boolean; caught: number }

export function stepWalker(w: Walker, dt: number) {
  w.v = w.hold ? Math.min(WALK.vmax, w.v + WALK.accel * dt) : Math.max(0, w.v - WALK.decel * dt);
  w.x += w.v * dt;
}

/** True if the walker is moving while the caller is watching. */
export function isCaught(w: Walker, c: Caller): boolean {
  return c.state === 'watch' && w.v > WALK.still;
}

/** Computer walker: estimates the time left in the chant and stops with a margin. */
export class WalkerAI {
  private margin: number;
  private brave: number;
  private round = -1;
  private cur = 0.3;
  constructor(diff: 'easy' | 'medium' | 'hard', private rng: Rng) {
    this.margin = diff === 'easy' ? 0.4 : diff === 'medium' ? 0.27 : 0.18;
    this.brave = diff === 'easy' ? 0.12 : diff === 'medium' ? 0.05 : 0.02;
  }
  update(w: Walker, c: Caller) {
    if (c.state !== 'chant') { w.hold = false; return; }
    // Stopping from full speed takes vmax/decel = 0.25 s; the turn (0.2 s) is a small grace.
    if (c.round !== this.round) {
      this.round = c.round;
      this.cur = this.margin + this.rng.gauss() * 0.04 - (this.rng.chance(this.brave) ? 0.25 : 0);
    }
    w.hold = c.timeLeft() > this.cur;
  }
}
