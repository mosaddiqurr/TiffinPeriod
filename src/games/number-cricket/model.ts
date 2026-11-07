import type { Rng } from '../../engine/rng';
import type { BallRecord, PickRules } from '../hand-cricket/logic';
import type { Situation } from '../hand-cricket/ai';

// Number Cricket: each player writes a number on a chit in secret; both chits open together.
// Two household variants:
// - "0–6 with the zero rule": same number = OUT. If the batter writes 0 (a defensive block)
//   and the bowler does not, the batter steals the BOWLER's number. Bowling big numbers is risky.
// - "1–10 big numbers": same number = OUT, otherwise the batter's number. Fast and wild.

export type Variant = 'zero' | 'ten';

export const NUMS: Record<Variant, number[]> = { zero: [0, 1, 2, 3, 4, 5, 6], ten: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };

export function judge(variant: Variant, bat: number, bowl: number): BallRecord {
  if (bat === bowl) return { bat, bowl, out: true, runs: 0 };
  if (variant === 'zero' && bat === 0) return { bat, bowl, out: false, runs: bowl };
  return { bat, bowl, out: false, runs: bat };
}

export function rulesFor(variant: Variant): PickRules {
  const set = new Set(NUMS[variant]);
  return { valid: (n) => set.has(n), judge: (a, b) => judge(variant, a, b) };
}

/** Runs per ball if both sides pick at random (for pressure and simulations). */
export function parFor(variant: Variant): number {
  const nums = NUMS[variant];
  let runs = 0;
  for (const a of nums) for (const b of nums) runs += judge(variant, a, b).runs;
  return runs / (nums.length * nums.length);
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * The computer for Number Cricket. Like the Hand Cricket computer it commits before it
 * sees your chit. It predicts your next number from your history (frequency plus what you
 * wrote after your last number) and picks the number with the best expected value.
 */
export class NumberAI {
  private seq: Record<'bat' | 'bowl', number[]> = { bat: [], bowl: [] };
  constructor(public difficulty: Difficulty, private rng: Rng, private variant: Variant) {}

  private get nums() { return NUMS[this.variant]; }

  observe(opponentRole: 'bat' | 'bowl', n: number) { this.seq[opponentRole].push(n); }

  predict(opponentRole: 'bat' | 'bowl'): number[] {
    const s = this.seq[opponentRole];
    const nums = this.nums;
    const freq = nums.map((n) => 1 + s.filter((x) => x === n).length);
    const tot = freq.reduce((a, b) => a + b, 0);
    const pf = freq.map((f) => f / tot);
    if (s.length < 2) return pf;
    const last = s[s.length - 1];
    const tr = nums.map(() => 0.5);
    for (let i = 0; i + 1 < s.length; i++) if (s[i] === last) tr[nums.indexOf(s[i + 1])] += 1;
    const tt = tr.reduce((a, b) => a + b, 0);
    const w = Math.min(0.6, s.length / 20);
    return pf.map((p, i) => p * (1 - w) + (tr[i] / tt) * w);
  }

  private soft(scores: number[], temp: number): number {
    const max = Math.max(...scores);
    const w = scores.map((e) => Math.exp((e - max) / temp));
    let r = this.rng.next() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return this.nums[i]; }
    return this.nums[this.nums.length - 1];
  }

  choose(role: 'bat' | 'bowl', sit: Situation): number {
    const blend = this.difficulty === 'easy' ? 0.15 : this.difficulty === 'medium' ? 0.55 : 0.88;
    if (!this.rng.chance(blend)) return this.rng.pick(this.nums);
    const risk = (sit.wicketsLeft <= 1 ? 16 : 7) * (this.variant === 'ten' ? 1.4 : 1);
    const temp = this.difficulty === 'hard' ? 1.1 : 2.4;
    if (role === 'bowl') {
      const p = this.predict('bat');
      const ev = this.nums.map((b) => this.nums.reduce((acc, a, i) => {
        const r = judge(this.variant, a, b);
        return acc + p[i] * (r.out ? risk : -r.runs);
      }, 0));
      return this.soft(ev, temp);
    }
    const p = this.predict('bowl');
    const ev = this.nums.map((a) => this.nums.reduce((acc, b, j) => {
      const r = judge(this.variant, a, b);
      const gain = sit.need !== undefined && r.runs >= sit.need ? 30 : r.runs;
      return acc + p[j] * (r.out ? -risk : gain);
    }, 0));
    return this.soft(ev, temp);
  }

  chooseBatFirst(): boolean { return this.rng.chance(0.4); }
}
