import type { Rng } from '../../engine/rng';

// Dots and Boxes (ঘর কাটা). A board of R × C boxes has (R+1)·C horizontal and
// R·(C+1) vertical lines. Drawing the fourth side of a box claims it and the same
// player draws again. Pure data; the screen and a future online room use `apply`.

export interface Board {
  rows: number;
  cols: number;
  /** For each line, the boxes on either side (one or two). */
  lineBoxes: number[][];
  /** For each box, its four lines. */
  boxLines: number[][];
  lines: number;
}

export interface DBState {
  board: Board;
  drawn: Array<-1 | 0 | 1>;
  owner: Array<-1 | 0 | 1>;
  turn: 0 | 1;
  score: [number, number];
  last: number | null;
  done: boolean;
}

/** Line index: horizontals first (r 0..R, c 0..C-1), then verticals (r 0..R-1, c 0..C). */
export function makeBoard(rows: number, cols: number): Board {
  const H = (rows + 1) * cols;
  const V = rows * (cols + 1);
  const h = (r: number, c: number) => r * cols + c;
  const v = (r: number, c: number) => H + r * (cols + 1) + c;
  const boxLines: number[][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) boxLines.push([h(r, c), h(r + 1, c), v(r, c), v(r, c + 1)]);
  const lineBoxes: number[][] = Array.from({ length: H + V }, () => []);
  boxLines.forEach((ls, b) => ls.forEach((l) => lineBoxes[l].push(b)));
  return { rows, cols, lineBoxes, boxLines, lines: H + V };
}

export function lineGeom(b: Board, l: number): { x1: number; y1: number; x2: number; y2: number } {
  const H = (b.rows + 1) * b.cols;
  if (l < H) { const r = Math.floor(l / b.cols), c = l % b.cols; return { x1: c, y1: r, x2: c + 1, y2: r }; }
  const k = l - H; const r = Math.floor(k / (b.cols + 1)), c = k % (b.cols + 1);
  return { x1: c, y1: r, x2: c, y2: r + 1 };
}

export function newGame(rows: number, cols: number, first: 0 | 1 = 0): DBState {
  const board = makeBoard(rows, cols);
  return { board, drawn: Array(board.lines).fill(-1), owner: Array(rows * cols).fill(-1), turn: first, score: [0, 0], last: null, done: false };
}

const sidesOf = (st: Pick<DBState, 'board' | 'drawn'>, box: number) => st.board.boxLines[box].reduce((a, l) => a + (st.drawn[l] >= 0 ? 1 : 0), 0);

export function apply(st: DBState, l: number): DBState {
  if (st.done || st.drawn[l] >= 0) return st;
  const drawn = st.drawn.slice();
  drawn[l] = st.turn;
  const owner = st.owner.slice();
  const score: [number, number] = [st.score[0], st.score[1]];
  let got = 0;
  for (const b of st.board.lineBoxes[l]) {
    if (owner[b] < 0 && st.board.boxLines[b].every((x) => drawn[x] >= 0)) { owner[b] = st.turn; score[st.turn]++; got++; }
  }
  const done = owner.every((o) => o >= 0);
  return { ...st, drawn, owner, score, last: l, turn: got ? st.turn : st.turn === 0 ? 1 : 0, done };
}

export const freeLines = (st: DBState) => st.drawn.map((d, i) => (d < 0 ? i : -1)).filter((i) => i >= 0);
const completes = (st: DBState, l: number) => st.board.lineBoxes[l].filter((b) => st.owner[b] < 0 && sidesOf(st, b) === 3).length;
/** A safe line gives no box a third side. */
const safe = (st: DBState, l: number) => st.board.lineBoxes[l].every((b) => sidesOf(st, b) < 2);

/** How many boxes the opponent could take in a row after this line (greedy). */
function giveaway(st: DBState, l: number): number {
  let s = apply(st, l);
  if (s.turn === st.turn) return -1; // it captured: not a giveaway
  let n = 0;
  for (let guard = 0; guard < 400 && !s.done; guard++) {
    const take = freeLines(s).find((x) => completes(s, x) > 0);
    if (take === undefined) break;
    const before = s.score[s.turn];
    s = apply(s, take);
    n += s.score[s.turn] - before > 0 ? s.score[s.turn] - before : 0;
  }
  return n;
}

// ---- Exact endgame search (negamax with memo on the set of drawn lines) ----

function solve(st: DBState, budget: { n: number }): { move: number; value: number } | null {
  const free = freeLines(st);
  const memo = new Map<bigint, number>();
  const drawn = st.drawn.map((d) => d >= 0);
  let mask = 0n;
  drawn.forEach((d, i) => { if (d) mask |= 1n << BigInt(i); });
  const isDrawn = (m: bigint, l: number) => ((m >> BigInt(l)) & 1n) === 1n;
  const gain = (m: bigint, l: number) => {
    let k = 0;
    for (const b of st.board.lineBoxes[l]) if (st.board.boxLines[b].every((x) => x === l || isDrawn(m, x))) k++;
    return k;
  };
  const V = (m: bigint, left: number[]): number => {
    if (!left.length) return 0;
    const hit = memo.get(m);
    if (hit !== undefined) return hit;
    if (--budget.n < 0) throw new Error('budget');
    let best = -Infinity;
    // Captures first: they are usually right and make the search fast.
    const order = [...left].sort((a, b) => gain(m, b) - gain(m, a));
    for (const l of order) {
      const k = gain(m, l);
      const rest = left.filter((x) => x !== l);
      const nm = m | (1n << BigInt(l));
      const v = k > 0 ? k + V(nm, rest) : -V(nm, rest);
      if (v > best) best = v;
    }
    memo.set(m, best);
    return best;
  };
  try {
    let bestMove = free[0], bestVal = -Infinity;
    for (const l of free) {
      const k = gain(mask, l);
      const nm = mask | (1n << BigInt(l));
      const rest = free.filter((x) => x !== l);
      const v = k > 0 ? k + V(nm, rest) : -V(nm, rest);
      if (v > bestVal) { bestVal = v; bestMove = l; }
    }
    return { move: bestMove, value: bestVal };
  } catch {
    return null;
  }
}

export type Level = 'easy' | 'medium' | 'hard';

export function aiMove(st: DBState, level: Level, rng: Rng): number {
  const free = freeLines(st);
  const caps = free.filter((l) => completes(st, l) > 0);
  if (level === 'easy') {
    if (caps.length && rng.chance(0.75)) return rng.pick(caps);
    const safes = free.filter((l) => safe(st, l));
    return rng.pick(safes.length && rng.chance(0.6) ? safes : free);
  }
  const safes = free.filter((l) => safe(st, l));
  if (level === 'hard' && !safes.length) {
    const limit = st.board.lines <= 24 ? 20 : st.board.lines <= 40 ? 16 : 14;
    if (free.length <= limit) {
      const s = solve(st, { n: 250_000 });
      if (s) return s.move;
    }
  }
  if (caps.length) return rng.pick(caps);
  if (safes.length) return rng.pick(safes);
  // No safe line: give away as few boxes as possible.
  let best = free[0], bestN = Infinity;
  for (const l of free) { const g = giveaway(st, l); if (g >= 0 && g < bestN) { bestN = g; best = l; } }
  return best;
}
