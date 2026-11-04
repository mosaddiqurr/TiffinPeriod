import type { Rng } from '../../engine/rng';

// Hand Cricket computer opponent.
//
// Fairness rule: the computer chooses BEFORE it knows the human's number
// for that ball. choose() receives only the history of earlier balls.
//
// Model: the opponent's next number is predicted from
//   (a) how often the opponent used each number (Laplace-smoothed), and
//   (b) a first-order Markov table: what the opponent played after their last number.
// Easy plays at random. Medium and hard blend the prediction with randomness.

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Role = 'bat' | 'bowl';

export interface Situation {
  /** Runs needed to win, when chasing. */
  need?: number;
  /** Wickets left for the batting side (including the current one). */
  wicketsLeft: number;
  /** Balls left, or null for no limit. */
  ballsLeft: number | null;
}

const NUMS = [1, 2, 3, 4, 5, 6];

export class HandAI {
  /** Opponent picks, by the role the OPPONENT had. */
  private seq: Record<Role, number[]> = { bat: [], bowl: [] };

  constructor(public difficulty: Difficulty, private rng: Rng) {}

  /** Record what the opponent played in a role. Call after each reveal. */
  observe(opponentRole: Role, n: number) {
    this.seq[opponentRole].push(n);
  }

  /** Predicted probability of each number 1..6 for the opponent in a role. */
  predict(opponentRole: Role): number[] {
    const s = this.seq[opponentRole];
    const freq = NUMS.map((n) => 1 + s.filter((x) => x === n).length);
    const fTot = freq.reduce((a, b) => a + b, 0);
    const pFreq = freq.map((f) => f / fTot);
    if (s.length < 2) return pFreq;
    const last = s[s.length - 1];
    const trans = NUMS.map(() => 0.5);
    for (let i = 0; i + 1 < s.length; i++) if (s[i] === last) trans[s[i + 1] - 1] += 1;
    const tTot = trans.reduce((a, b) => a + b, 0);
    const pMarkov = trans.map((x) => x / tTot);
    const wM = Math.min(0.6, s.length / 20);
    return pFreq.map((p, i) => p * (1 - wM) + pMarkov[i] * wM);
  }

  private blend(): number {
    return this.difficulty === 'easy' ? 0 : this.difficulty === 'medium' ? 0.5 : 0.85;
  }

  private sample(weights: number[]): number {
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = this.rng.next() * tot;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i + 1;
    }
    return 6;
  }

  /** Choose a number for this ball. It does not see the opponent's current pick. */
  choose(role: Role, sit: Situation): number {
    const b = this.blend();
    if (b === 0 || this.rng.chance(1 - b)) return this.rng.int(1, 6);
    if (role === 'bowl') {
      // Bowl the number the batter most likely shows. Sharpen the prediction.
      const p = this.predict('bat');
      return this.sample(p.map((x) => x ** 3));
    }
    // Batting: avoid the predicted bowler number and value runs.
    const p = this.predict('bowl');
    const risk = sit.wicketsLeft <= 1 ? 14 : 6; // cost of losing a wicket, in runs
    const ev = NUMS.map((n, i) => {
      const safe = 1 - p[i];
      let gain = n;
      if (sit.need !== undefined && n >= sit.need) gain = 30; // this number wins the match
      return gain * safe - risk * p[i];
    });
    const temp = this.difficulty === 'hard' ? 1.2 : 2.5;
    const max = Math.max(...ev);
    return this.sample(ev.map((e) => Math.exp((e - max) / temp)));
  }

  /** Toss decision when the computer wins: bat first or bowl first. */
  chooseBatFirst(): boolean {
    return this.rng.chance(0.45);
  }
}
