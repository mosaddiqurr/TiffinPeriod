// Contract for online play. Hand Cricket is online now (docs/ONLINE_PLAY.md): the connection is
// src/platform/net/link.ts (InsForge Realtime), rooms, links and quick match are
// src/platform/net/rooms.ts, and the match is src/games/hand-cricket/duel.ts. The notes below
// are how the other games are prepared to follow.
//
// How the games are prepared for it:
// - Rules live in pure modules (model.ts / logic.ts) as `apply(state, move)`
//   functions with plain-data state. A server or a peer can replay the same moves.
// - Hidden choices (Hand Cricket, Number Cricket) are committed before they are
//   revealed. Online, a player sends a hash of (choice + salt) first and the
//   choice later, so nobody can change a number after seeing the other one.
// - Random things (book pages, daily challenges, tournament draws) use seeded
//   generators, so both players can derive the same sequence from one seed.
// - Turn-based physics games (Flikk Football, Eraser Flip) send only the flick
//   (piece, angle, power); the fixed-step simulation gives the same result on
//   both devices. Flikk Football has two styles: 'free' (flick a player into the
//   ball) and 'fixed' (players pinned to their spots, the ball is flicked between
//   them; no piece is sent). Fixed is the one to put online first: only the ball
//   moves, so a turn is tiny and quick to check. The player who flicked also sends
//   where the ball stopped, so the other device can correct any rounding drift.
//
// A later phase adds a Transport (WebRTC data channel with a free signalling
// service, or a free-tier websocket host) behind this interface.

export interface Envelope<M> {
  game: string;
  room: string;
  seq: number;
  from: 'host' | 'guest';
  move: M;
}

export interface Transport<M = unknown> {
  send(msg: Envelope<M>): void;
  onMessage(fn: (msg: Envelope<M>) => void): () => void;
  close(): void;
}

/** A turn-based game in the form an online room needs. */
export interface TurnRules<State, Move> {
  init(seed: number): State;
  apply(state: State, move: Move): State;
  /** The side whose move it is, or null when the game is over. */
  turn(state: State): 0 | 1 | null;
}

export type Lobby =
  | { kind: 'random' }                 // 1v1 against a random player
  | { kind: 'invite'; code: string }   // private match by a shareable link
  | { kind: 'friend'; friendId: string };

/** Commitment for a secret pick. */
export async function commit(choice: number, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${choice}:${salt}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A loopback transport for tests: both sides in one page. */
export function loopback<M>(): [Transport<M>, Transport<M>] {
  const a = new Set<(m: Envelope<M>) => void>();
  const b = new Set<(m: Envelope<M>) => void>();
  const make = (mine: Set<(m: Envelope<M>) => void>, theirs: Set<(m: Envelope<M>) => void>): Transport<M> => ({
    send: (m) => queueMicrotask(() => theirs.forEach((fn) => fn(m))),
    onMessage: (fn) => { mine.add(fn); return () => mine.delete(fn); },
    close: () => mine.clear(),
  });
  return [make(a, b), make(b, a)];
}

/** One Flikk Football flick as it travels online. */
export interface FlikkMove {
  style: 'free' | 'fixed';
  /** Free style: the piece flicked. Fixed style: left out (the ball is flicked from whoever has it). */
  piece?: number;
  angle: number;
  power: number;
  spin: number;
  /** Where the ball came to rest on the sender's device, for a drift check. */
  rest?: { x: number; y: number };
}
