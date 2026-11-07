export type Side = 'goats' | 'tigers';
export type Move = { from: number; to: number; capture?: number };
export type Position = { goats: number[]; tigers: number[]; turn: Side; captured: number; ply: number; quiet: number; target: number };
export type Verdict = Side | 'draw' | null;

export function initialPosition(target = 10): Position {
  const goats = Array<number>(25).fill(0);
  // Bengal's stacked start: two columns, four stacks of five goats.
  [1, 3, 11, 13].forEach((p) => { goats[p] = 5; });
  return { goats, tigers: [7, 17], turn: 'goats', captured: 0, ply: 0, quiet: 0, target };
}

export function linked(a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= 25 || b >= 25 || a === b) return false;
  const ax = a % 5, ay = Math.floor(a / 5), bx = b % 5, by = Math.floor(b / 5);
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return dx + dy === 1 || (dx === 1 && dy === 1 && (ax + ay) % 2 === 0);
}

export const EDGES: Array<[number, number]> = Array.from({ length: 25 }, (_, a) =>
  Array.from({ length: 25 }, (_, b) => [a, b] as [number, number]).filter(([, b]) => b > a && linked(a, b))).flat();

export function legalMoves(s: Position, side: Side = s.turn): Move[] {
  const occupied = (p: number) => s.goats[p] > 0 || s.tigers.includes(p);
  const pieces = side === 'tigers' ? s.tigers : s.goats.flatMap((count, i) => count > 0 ? [i] : []);
  const moves: Move[] = [];
  for (const from of pieces) {
    for (let to = 0; to < 25; to++) {
      if (!occupied(to) && linked(from, to)) moves.push({ from, to });
    }
    if (side !== 'tigers') continue;
    for (let over = 0; over < 25; over++) {
      if (!s.goats[over] || !linked(from, over)) continue;
      const x = (over % 5) * 2 - from % 5, y = Math.floor(over / 5) * 2 - Math.floor(from / 5);
      if (x < 0 || x > 4 || y < 0 || y > 4) continue;
      const to = y * 5 + x;
      if (!occupied(to) && linked(over, to)) moves.push({ from, to, capture: over });
    }
  }
  return moves;
}

export function positionKey(s: Position): string { return `${s.turn}:${[...s.tigers].sort((a, b) => a - b).join(',')}:${s.goats.join(',')}`; }

export function verdict(s: Position): Verdict {
  if (s.captured >= s.target) return 'tigers';
  if (!legalMoves(s, 'tigers').length) return 'goats';
  if (!legalMoves(s, 'goats').length) return 'tigers';
  if (s.quiet >= 100 || s.ply >= 300) return 'draw';
  return null;
}

export function applyMove(s: Position, move: Move): Position {
  const valid = legalMoves(s).find((m) => m.from === move.from && m.to === move.to);
  if (!valid || verdict(s)) throw new Error('Illegal move');
  const next: Position = { ...s, goats: [...s.goats], tigers: [...s.tigers], turn: s.turn === 'goats' ? 'tigers' : 'goats', ply: s.ply + 1, quiet: s.quiet + 1 };
  if (s.turn === 'goats') { next.goats[move.from]--; next.goats[move.to]++; }
  else {
    next.tigers[next.tigers.indexOf(move.from)] = move.to;
    if (valid.capture !== undefined) { next.goats[valid.capture]--; next.captured++; next.quiet = 0; }
  }
  return next;
}

/** A small alpha-beta search. The tiger evaluation rewards captures and mobility. */
export function chooseMove(s: Position, depth = 2, random: () => number = Math.random): Move | null {
  const moves = legalMoves(s);
  if (!moves.length || verdict(s)) return null;
  const evaluate = (p: Position) => {
    const end = verdict(p);
    if (end) return end === 'tigers' ? 10000 - p.ply : end === 'goats' ? -10000 + p.ply : 0;
    const tm = legalMoves(p, 'tigers');
    const captures = tm.filter((m) => m.capture !== undefined).length;
    const spread = p.goats.filter((x) => x > 0).length;
    return p.captured * 100 + tm.length * 6 + captures * 25 - spread * 4;
  };
  const search = (p: Position, d: number, alpha: number, beta: number): number => {
    if (!d || verdict(p)) return evaluate(p);
    const max = p.turn === 'tigers';
    let best = max ? -Infinity : Infinity;
    const ordered = legalMoves(p).sort((a, b) => Number(b.capture !== undefined) - Number(a.capture !== undefined));
    for (const m of ordered) {
      const score = search(applyMove(p, m), d - 1, alpha, beta);
      best = max ? Math.max(best, score) : Math.min(best, score);
      if (max) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  };
  let best = s.turn === 'tigers' ? -Infinity : Infinity;
  let choices: Move[] = [];
  for (const m of moves) {
    const value = search(applyMove(s, m), Math.max(0, depth - 1), -Infinity, Infinity);
    const better = s.turn === 'tigers' ? value > best : value < best;
    if (better) { best = value; choices = [m]; }
    else if (value === best) choices.push(m);
  }
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
