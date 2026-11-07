import { getLink, type Chan, type Member } from './link';

// Two-player rooms for any game, three ways in:
// 1. Create a room: you get a short code (5 letters/numbers, no look-alikes such as 0/O, 1/I/L).
// 2. Share a link: the same room as a URL (…#/play/<game>?room=CODE); opening it joins.
// 3. Quick match: wait in the game's lobby; the two players who have waited longest are paired.
//    If nobody turns up in time, the caller gets a stand-in opponent instead (see `makeBot`).
//
// Channels: tp:<game>:lobby and tp:<game>:room:<CODE>.
// A room is for two. The creator is the host; the host answers "hello" with "welcome".
// After that, `Peer` carries the game's messages, reliably and in order: each message has a
// number, the other side acknowledges it, and anything not acknowledged is sent again.

export interface Profile { name: string; team: string }

export interface Peer {
  /** Host = side 0 (created the room, or the longer waiter in quick match). */
  host: boolean;
  me: Profile;
  them: Profile;
  code: string;
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
  /** The other player left or lost the connection for good. */
  onGone(cb: () => void): () => void;
  close(): void;
}

export const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LEN = 5;

export function newCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}

/** Tidy what someone typed into a code: upper case, spaces and other characters dropped. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LEN);
}

export const isCode = (s: string) => s.length === CODE_LEN && [...s].every((c) => CODE_CHARS.includes(c));

/** A code made from two player ids, the same on both devices. */
export function pairCode(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  let h = 2166136261;
  for (const ch of `${x}|${y}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) { s += CODE_CHARS[h % CODE_CHARS.length]; h = Math.floor(h / CODE_CHARS.length) || (h ^ 0x9e3779b9) >>> 0; }
  return s;
}

export function roomLink(game: string, code: string): string {
  return `${location.origin}${location.pathname}#/play/${game}?room=${code}`;
}

const roomChan = (game: string, code: string) => `tp:${game}:room:${code}`;
const lobbyChan = (game: string) => `tp:${game}:lobby`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NetError extends Error {
  constructor(public code: 'not-found' | 'full' | 'offline' | 'cancelled') { super(code); }
}

// ---------- Reliable, ordered messages over a channel ----------

const RESEND_MS = 1200;
const PING_MS = 2500;
const GONE_MS = 12000;

function makePeer(ch: Chan, other: string, host: boolean, me: Profile, them: Profile, code: string): Peer {
  let out = 0;
  let expect = 1;
  const pending = new Map<number, { type: string; data: unknown; at: number }>();
  const early = new Map<number, { type: string; data: unknown }>();
  const handlers = new Map<string, Set<(d: any) => void>>();
  const gone = new Set<() => void>();
  let lastHeard = Date.now();
  let closed = false;
  let goneFired = false;
  const fireGone = () => { if (goneFired || closed) return; goneFired = true; gone.forEach((cb) => cb()); };
  // Messages that arrive before the game listens for them wait here (the "Player found!" screen).
  const inbox = new Map<string, unknown[]>();
  const deliver = (type: string, data: unknown) => {
    const hs = handlers.get(type);
    if (hs && hs.size) hs.forEach((cb) => cb(data));
    else { if (!inbox.has(type)) inbox.set(type, []); inbox.get(type)!.push(data); }
  };
  const offs = [
    ch.on('m', (f: { s: number; type: string; data: unknown; to: string }, from) => {
      if (from !== other || f.to !== ch.me) return;
      lastHeard = Date.now();
      ch.send('ack', { s: f.s, to: other });
      if (f.s < expect || early.has(f.s)) return;
      early.set(f.s, f);
      while (early.has(expect)) { const g = early.get(expect)!; early.delete(expect); expect++; deliver(g.type, g.data); }
    }),
    ch.on('ack', (a: { s: number; to: string }, from) => { if (from === other && a.to === ch.me) { pending.delete(a.s); lastHeard = Date.now(); } }),
    ch.on('ping', (p: { to: string }, from) => { if (from === other && p.to === ch.me) lastHeard = Date.now(); }),
    ch.on('bye', (p: { to: string }, from) => { if (from === other && p.to === ch.me) fireGone(); }),
    ch.onPresence((ms) => { if (!ms.some((m) => m.id === other)) setTimeout(() => { if (!ch.members().some((m) => m.id === other)) fireGone(); }, 2500); }),
  ];
  // Leaving the page (closing the tab, going to another site) says goodbye straight away.
  const onHide = () => { if (!closed) ch.send('bye', { to: other }); };
  addEventListener('pagehide', onHide);
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [s, p] of pending) if (now - p.at > RESEND_MS) { p.at = now; ch.send('m', { s, type: p.type, data: p.data, to: other }); }
    ch.send('ping', { to: other });
    if (now - lastHeard > GONE_MS) fireGone();
  }, PING_MS / 2);
  return {
    host, me, them, code,
    send(type, data) {
      if (closed) return;
      const s = ++out;
      pending.set(s, { type, data, at: Date.now() });
      ch.send('m', { s, type, data, to: other });
    },
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(cb);
      const q = inbox.get(type);
      if (q) { inbox.delete(type); queueMicrotask(() => q.forEach((d) => cb(d))); }
      return () => handlers.get(type)?.delete(cb);
    },
    onGone(cb) { gone.add(cb); return () => gone.delete(cb); },
    close() {
      if (closed) return;
      ch.send('bye', { to: other });
      closed = true;
      clearInterval(timer);
      removeEventListener('pagehide', onHide);
      offs.forEach((f) => f());
      setTimeout(() => ch.leave(), 300);
    },
  };
}

// ---------- Host: wait for a guest ----------

/** Wait in a room as host until a guest says hello (optionally only `only`). */
function hostRoom(ch: Chan, me: Profile, code: string, signal: { cancelled: boolean }, only?: string, timeoutMs = Infinity): Promise<Peer> {
  return new Promise((resolve, reject) => {
    let guest: string | null = null;
    let themP: Profile | null = null;
    const t0 = Date.now();
    const off = ch.on('hello', (d: { profile: Profile; to?: string }, from) => {
      if (only && from !== only) return;
      if (guest && from !== guest) { ch.send('full', { to: from }); return; }
      guest = from; themP = d.profile;
      ch.send('welcome', { to: from, profile: me });
    });
    const offReady = ch.on('ready', (_d: unknown, from) => {
      if (from !== guest || !themP) return;
      cleanup();
      resolve(makePeer(ch, from, true, me, themP, code));
    });
    const iv = setInterval(() => {
      if (signal.cancelled) { cleanup(); reject(new NetError('cancelled')); }
      else if (Date.now() - t0 > timeoutMs) { cleanup(); reject(new NetError('not-found')); }
    }, 200);
    const cleanup = () => { off(); offReady(); clearInterval(iv); };
  });
}

/** Say hello until the host welcomes us; then confirm with "ready". */
function guestRoom(ch: Chan, me: Profile, code: string, signal: { cancelled: boolean }, only?: string, timeoutMs = 6000): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; off(); offFull(); clearInterval(iv); fn(); };
    const off = ch.on('welcome', (d: { to: string; profile: Profile }, from) => {
      if (d.to !== ch.me || (only && from !== only)) return;
      ch.send('ready', { to: from });
      // Say ready a couple more times in case the first is lost; the host ignores repeats.
      setTimeout(() => ch.send('ready', { to: from }), 400);
      setTimeout(() => ch.send('ready', { to: from }), 1200);
      finish(() => resolve(makePeer(ch, from, false, me, d.profile, code)));
    });
    const offFull = ch.on('full', (d: { to: string }) => { if (d.to === ch.me) finish(() => reject(new NetError('full'))); });
    const hello = () => ch.send('hello', { profile: me });
    hello();
    const iv = setInterval(() => {
      if (signal.cancelled) finish(() => reject(new NetError('cancelled')));
      else if (Date.now() - t0 > timeoutMs) finish(() => reject(new NetError(ch.members().length > 2 ? 'full' : 'not-found')));
      else hello();
    }, 700);
  });
}

export interface Waiting { code: string; peer: Promise<Peer>; cancel(): void }

/** Create a room with a fresh code and wait for a friend. */
export async function createRoom(game: string, me: Profile): Promise<Waiting> {
  const link = await getLink().catch(() => { throw new NetError('offline'); });
  for (let tries = 0; tries < 5; tries++) {
    const code = newCode();
    const ch = await link.join(roomChan(game, code));
    if (ch.members().length > 1) { ch.leave(); continue; }
    const signal = { cancelled: false };
    const peer = hostRoom(ch, me, code, signal);
    peer.catch(() => ch.leave());
    return { code, peer, cancel: () => { signal.cancelled = true; } };
  }
  throw new NetError('offline');
}

/** Join a friend's room by code. */
export async function joinRoom(game: string, code: string, me: Profile, signal = { cancelled: false }): Promise<Peer> {
  const link = await getLink().catch(() => { throw new NetError('offline'); });
  const ch = await link.join(roomChan(game, code));
  try {
    return await guestRoom(ch, me, code, signal);
  } catch (e) {
    ch.leave();
    throw e;
  }
}

/** Order players in the lobby and find my partner: 1st with 2nd, 3rd with 4th, … */
export function pairUp(members: Member[], me: string): { partner: string; host: boolean } | null {
  const i = members.findIndex((m) => m.id === me);
  if (i < 0) return null;
  const j = i % 2 === 0 ? i + 1 : i - 1;
  if (j >= members.length) return null;
  return { partner: members[j].id, host: i < j };
}

/**
 * Quick match: wait in the lobby for another player. If none is found within `waitMs`,
 * `makeBot` supplies the opponent instead. `onTick` reports seconds waited.
 */
export async function quickMatch(game: string, me: Profile, opts: { waitMs?: number; makeBot: () => Peer; onTick?: (s: number) => void; signal?: { cancelled: boolean } }): Promise<Peer> {
  const waitMs = opts.waitMs ?? 10000;
  const signal = opts.signal ?? { cancelled: false };
  const t0 = Date.now();
  const tick = setInterval(() => opts.onTick?.(Math.floor((Date.now() - t0) / 1000)), 250);
  try {
    let link;
    try { link = await getLink(); } catch { link = null; }
    while (link && Date.now() - t0 < waitMs) {
      if (signal.cancelled) throw new NetError('cancelled');
      const lobby = await link.join(lobbyChan(game));
      const pair = await new Promise<{ partner: string; host: boolean } | null>((resolve) => {
        const check = () => {
          const p = pairUp(lobby.members(), lobby.me);
          if (p) { off(); clearInterval(iv); resolve(p); }
        };
        const off = lobby.onPresence(check);
        const iv = setInterval(() => {
          if (signal.cancelled || Date.now() - t0 >= waitMs) { off(); clearInterval(iv); resolve(null); }
        }, 200);
        check();
      });
      const myId = lobby.me;
      lobby.leave();
      if (!pair) break;
      // Both sides work out the same room from their two ids.
      const code = pairCode(myId, pair.partner);
      const ch = await link.join(roomChan(game, code));
      try {
        const left = Math.max(2500, Math.min(5000, waitMs - (Date.now() - t0) + 2500));
        return pair.host ? await hostRoom(ch, me, code, signal, undefined, left) : await guestRoom(ch, me, code, signal, undefined, left);
      } catch (e) {
        ch.leave();
        if (e instanceof NetError && e.code === 'cancelled') throw e;
        await sleep(150);
      }
    }
    if (signal.cancelled) throw new NetError('cancelled');
    // Nobody came: make the wait feel the same length, then the stand-in arrives.
    const rest = waitMs - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    if (signal.cancelled) throw new NetError('cancelled');
    return opts.makeBot();
  } finally {
    clearInterval(tick);
  }
}
