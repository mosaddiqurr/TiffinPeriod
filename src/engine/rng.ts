// Seeded pseudo-random numbers (mulberry32).
// Same seed → same sequence. We use this for fair split-screen play
// (both players get identical balloons) and for repeatable tests.

export interface Rng {
  next(): number; // [0, 1)
  range(lo: number, hi: number): number;
  int(lo: number, hiInclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  gauss(): number; // standard normal
  seed: number;
}

export function createRng(seed: number = (Math.random() * 2 ** 32) >>> 0): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    gauss: () => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
