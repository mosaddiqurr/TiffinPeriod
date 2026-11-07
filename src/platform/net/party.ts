import { getLink, type Chan, type Link, type Member } from './link';
import { newCode, type Profile } from './rooms';

// Party rooms: up to four players in one room (rooms.ts is for two). Built on the same
// channels (link.ts) and the same room codes and invite links (rooms.ts).
//
// Channels: tp:<game>:party:<CODE> for a room and tp:<game>:plobby for quick match.
//
// - The host creates the room. A guest says "phello" until the host answers "pwelcome"
//   (or "pno" when the room is full or the game has started).
// - The host keeps one reliable, ordered stream to each guest (numbered messages, acks,
//   resends, pings), so a game sends to one player (secret cards) or to everyone. Guests
//   only talk to the host. Messages that arrive before the game listens are held.
// - The host sends the roster (who is in) whenever it changes, so every screen shows the
//   seats filling. A guest who closes, goes back or goes quiet for ~12 s is dropped
//   (`onLeft`); if the host goes, guests get `onLeft(hostId)`.
// - Quick match (`quickParty`): searchers are grouped in the lobby, oldest first, four to a
//   group. The longest waiter in a group becomes host when the group has four or it has
//   waited `waitMs`; it opens a room and calls the others in with "pgo". Alone: a party of
//   one (`soloParty`), and the game fills the other seats with stand-ins.

export const PARTY_MAX = 4;

export interface PartyMember { id: string; profile: Profile }

export interface Party {
  host: boolean;
  code: string;
  /** My id in the room. */
  me: string;
  hostId: string;
  /** Everyone in the room now: the host first, then in the order they joined. */
  members(): PartyMember[];
  onMembers(cb: (m: PartyMember[]) => void): () => void;
  /** Host: to one guest (`to` = their id) or to every guest. Guest: to the host (`to` is ignored). */
  send(type: string, data?: unknown, to?: string): void;
  on(type: string, cb: (data: any, from: string) => void): () => void;
  /** Host: a guest left for good. Guest: the host left (id = hostId). */
  onLeft(cb: (id: string) => void): () => void;
  /** Host: no more joins (true while a game is on). */
  lock(locked?: boolean): void;
  close(): void;
}

export class PartyError extends Error {
  constructor(public code: 'not-found' | 'full' | 'started' | 'offline' | 'cancelled') { super(code); }
}

export const partyChan = (game: string, code: string) => `tp:${game}:party:${code}`;
export const partyLobby = (game: string) => `tp:${game}:plobby`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RESEND_MS = 1200;
const TICK_MS = 1250;
const GONE_MS = 12000;
const PRESENCE_GRACE_MS = 2500;

// ---------- One reliable, ordered stream between two ids over a channel ----------

class Stream {
  private out = 0;
  private expect = 1;
  private pending = new Map<number, { type: string; data: unknown; at: number }>();
  private early = new Map<number, { type: string; data: unknown }>();
  lastHeard = Date.now();
  constructor(private ch: Chan, readonly other: string, private deliver: (type: string, data: unknown) => void) {}
  send(type: string, data: unknown) {
    const s = ++this.out;
    this.pending.set(s, { type, data, at: Date.now() });
    this.ch.send('pm', { s, type, data, to: this.other });
  }
  recv(f: { s: number; type: string; data: unknown }) {
    this.lastHeard = Date.now();
    this.ch.send('pa', { s: f.s, to: this.other });
    if (f.s < this.expect || this.early.has(f.s)) return;
    this.early.set(f.s, f);
    while (this.early.has(this.expect)) {
      const g = this.early.get(this.expect)!;
      this.early.delete(this.expect);
      this.expect++;
      this.deliver(g.type, g.data);
    }
  }
  ack(s: number) { this.pending.delete(s); this.lastHeard = Date.now(); }
  /** Resend what is not acknowledged and ping; true when the other side has gone quiet. */
  tick(now: number): boolean {
    for (const [s, p] of this.pending) if (now - p.at > RESEND_MS) { p.at = now; this.ch.send('pm', { s, type: p.type, data: p.data, to: this.other }); }
    this.ch.send('pp', { to: this.other });
    return now - this.lastHeard > GONE_MS;
  }
}

// ---------- Shared plumbing for both ends ----------

type Handlers = Map<string, Set<(d: any, from: string) => void>>;

function messageBox() {
  const handlers: Handlers = new Map();
  const inbox = new Map<string, Array<[unknown, string]>>();
  return {
    deliver(type: string, data: unknown, from: string) {
      const hs = handlers.get(type);
      if (hs && hs.size) hs.forEach((cb) => cb(data, from));
      else { if (!inbox.has(type)) inbox.set(type, []); inbox.get(type)!.push([data, from]); }
    },
    on(type: string, cb: (d: any, from: string) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(cb);
      const q = inbox.get(type);
      if (q) { inbox.delete(type); queueMicrotask(() => q.forEach(([d, f]) => cb(d, f))); }
      return () => { handlers.get(type)?.delete(cb); };
    },
  };
}

function cbSet<A>() {
  const s = new Set<(a: A) => void>();
  return { add: (cb: (a: A) => void) => { s.add(cb); return () => { s.delete(cb); }; }, fire: (a: A) => s.forEach((cb) => cb(a)) };
}

// ---------- Host ----------

function hostParty(ch: Chan, me: Profile, code: string): Party {
  const box = messageBox();
  const streams = new Map<string, Stream>();
  let members: PartyMember[] = [{ id: ch.me, profile: me }];
  const membersCbs = cbSet<PartyMember[]>();
  const leftCbs = cbSet<string>();
  let locked = false;
  let closed = false;
  const roster = () => {
    const list = members.map((m) => ({ id: m.id, profile: m.profile }));
    streams.forEach((s) => s.send('_roster', list));
    membersCbs.fire(members);
  };
  const drop = (id: string) => {
    if (closed || !streams.has(id)) return;
    streams.delete(id);
    members = members.filter((m) => m.id !== id);
    roster();
    leftCbs.fire(id);
  };
  const offs = [
    ch.on('phello', (d: { profile: Profile }, from) => {
      if (closed) return;
      if (streams.has(from)) { ch.send('pwelcome', { to: from, profile: me }); return; }
      if (locked) { ch.send('pno', { to: from, why: 'started' }); return; }
      if (members.length >= PARTY_MAX) { ch.send('pno', { to: from, why: 'full' }); return; }
      const name = String(d?.profile?.name ?? '').slice(0, 16) || '?';
      streams.set(from, new Stream(ch, from, (type, data) => box.deliver(type, data, from)));
      members = [...members, { id: from, profile: { name, team: String(d?.profile?.team ?? '') } }];
      ch.send('pwelcome', { to: from, profile: me });
      roster();
    }),
    ch.on('pm', (f: { s: number; type: string; data: unknown; to: string }, from) => { if (f.to === ch.me) streams.get(from)?.recv(f); }),
    ch.on('pa', (a: { s: number; to: string }, from) => { if (a.to === ch.me) streams.get(from)?.ack(a.s); }),
    ch.on('pp', (p: { to: string }, from) => { const s = streams.get(from); if (s && p.to === ch.me) s.lastHeard = Date.now(); }),
    ch.on('pbye', (p: { to: string }, from) => { if (p.to === ch.me) drop(from); }),
    ch.onPresence((ms) => {
      for (const id of streams.keys()) if (!ms.some((m) => m.id === id)) setTimeout(() => { if (!ch.members().some((m) => m.id === id)) drop(id); }, PRESENCE_GRACE_MS);
    }),
  ];
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of [...streams]) if (s.tick(now)) drop(id);
  }, TICK_MS);
  const onHide = () => { if (!closed) ch.send('pbye', { to: '*' }); };
  addEventListener('pagehide', onHide);
  return {
    host: true, code, me: ch.me, hostId: ch.me,
    members: () => members,
    onMembers: membersCbs.add,
    send(type, data, to) {
      if (closed) return;
      if (to !== undefined) streams.get(to)?.send(type, data);
      else streams.forEach((s) => s.send(type, data));
    },
    on: box.on,
    onLeft: leftCbs.add,
    lock(v = true) { locked = v; },
    close() {
      if (closed) return;
      ch.send('pbye', { to: '*' });
      closed = true;
      clearInterval(timer);
      removeEventListener('pagehide', onHide);
      offs.forEach((f) => f());
      setTimeout(() => ch.leave(), 300);
    },
  };
}

// ---------- Guest ----------

function guestParty(ch: Chan, me: Profile, code: string, hostId: string, hostProfile: Profile): Party {
  const box = messageBox();
  let members: PartyMember[] = [{ id: hostId, profile: hostProfile }, { id: ch.me, profile: me }];
  const membersCbs = cbSet<PartyMember[]>();
  const leftCbs = cbSet<string>();
  let closed = false;
  let goneFired = false;
  const gone = () => { if (closed || goneFired) return; goneFired = true; leftCbs.fire(hostId); };
  const stream = new Stream(ch, hostId, (type, data) => {
    if (type === '_roster') { members = data as PartyMember[]; membersCbs.fire(members); return; }
    box.deliver(type, data, hostId);
  });
  const offs = [
    ch.on('pm', (f: { s: number; type: string; data: unknown; to: string }, from) => { if (from === hostId && f.to === ch.me) stream.recv(f); }),
    ch.on('pa', (a: { s: number; to: string }, from) => { if (from === hostId && a.to === ch.me) stream.ack(a.s); }),
    ch.on('pp', (p: { to: string }, from) => { if (from === hostId && p.to === ch.me) stream.lastHeard = Date.now(); }),
    ch.on('pbye', (p: { to: string }, from) => { if (from === hostId && (p.to === ch.me || p.to === '*')) gone(); }),
    ch.onPresence((ms) => { if (!ms.some((m) => m.id === hostId)) setTimeout(() => { if (!ch.members().some((m) => m.id === hostId)) gone(); }, PRESENCE_GRACE_MS); }),
  ];
  const timer = setInterval(() => { if (stream.tick(Date.now())) gone(); }, TICK_MS);
  const onHide = () => { if (!closed) ch.send('pbye', { to: hostId }); };
  addEventListener('pagehide', onHide);
  return {
    host: false, code, me: ch.me, hostId,
    members: () => members,
    onMembers: membersCbs.add,
    send(type, data) { if (!closed) stream.send(type, data); },
    on: box.on,
    onLeft: leftCbs.add,
    lock() { /* only the host decides */ },
    close() {
      if (closed) return;
      ch.send('pbye', { to: hostId });
      closed = true;
      clearInterval(timer);
      removeEventListener('pagehide', onHide);
      offs.forEach((f) => f());
      setTimeout(() => ch.leave(), 300);
    },
  };
}

/** Say hello until the host welcomes us. */
function knock(ch: Chan, me: Profile, code: string, signal: { cancelled: boolean }, timeoutMs: number): Promise<Party> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; offW(); offNo(); clearInterval(iv); fn(); };
    const offW = ch.on('pwelcome', (d: { to: string; profile: Profile }, from) => {
      if (d.to !== ch.me) return;
      finish(() => resolve(guestParty(ch, me, code, from, d.profile)));
    });
    const offNo = ch.on('pno', (d: { to: string; why: 'full' | 'started' }) => {
      if (d.to === ch.me) finish(() => reject(new PartyError(d.why === 'started' ? 'started' : 'full')));
    });
    const hello = () => ch.send('phello', { profile: me });
    hello();
    const iv = setInterval(() => {
      if (signal.cancelled) finish(() => reject(new PartyError('cancelled')));
      else if (Date.now() - t0 > timeoutMs) finish(() => reject(new PartyError('not-found')));
      else hello();
    }, 700);
  });
}

// ---------- Public: create, join, solo, quick match ----------

/** Open a party room with a fresh code. The host is in it at once; guests arrive by `onMembers`. */
export async function createParty(game: string, me: Profile): Promise<Party> {
  const link = await getLink().catch(() => { throw new PartyError('offline'); });
  return openOn(link, game, me);
}

async function openOn(link: Link, game: string, me: Profile): Promise<Party> {
  for (let tries = 0; tries < 5; tries++) {
    const code = newCode();
    const ch = await link.join(partyChan(game, code));
    if (ch.members().length > 1) { ch.leave(); continue; }
    return hostParty(ch, me, code);
  }
  throw new PartyError('offline');
}

/** Join a friend's party room by code. */
export async function joinParty(game: string, code: string, me: Profile, signal = { cancelled: false }, timeoutMs = 6000): Promise<Party> {
  const link = await getLink().catch(() => { throw new PartyError('offline'); });
  return joinOn(link, game, code, me, signal, timeoutMs);
}

async function joinOn(link: Link, game: string, code: string, me: Profile, signal: { cancelled: boolean }, timeoutMs: number): Promise<Party> {
  const ch = await link.join(partyChan(game, code));
  try {
    return await knock(ch, me, code, signal, timeoutMs);
  } catch (e) {
    ch.leave();
    throw e;
  }
}

/** A party of one, with no connection: the game fills every other seat with stand-ins. */
export function soloParty(me: Profile): Party {
  const id = 'me';
  const members = [{ id, profile: me }];
  return {
    host: true, code: '', me: id, hostId: id,
    members: () => members,
    onMembers: () => () => {},
    send: () => {},
    on: () => () => {},
    onLeft: () => () => {},
    lock: () => {},
    close: () => {},
  };
}

/** Quick-match groups: the lobby oldest first, four to a group. Returns my group (ids, oldest first). */
export function groupOf(members: Member[], me: string, size = PARTY_MAX): string[] | null {
  const i = members.findIndex((m) => m.id === me);
  if (i < 0) return null;
  const g = Math.floor(i / size) * size;
  return members.slice(g, g + size).map((m) => m.id);
}

export interface QuickOpts {
  /** How long the longest waiter waits for the group to fill (default 10 s). */
  waitMs?: number;
  /** Seconds waited and how many players are in my group so far (me included). */
  onTick?: (seconds: number, found: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * Quick match for a party game. Resolves with a party: as host (the longest waiter, or alone:
 * a solo party) or as a guest in someone else's room. The host should start the game at once.
 */
export async function quickParty(game: string, me: Profile, opts: QuickOpts = {}): Promise<Party> {
  const waitMs = opts.waitMs ?? 10000;
  const signal = opts.signal ?? { cancelled: false };
  const t0 = Date.now();
  const waitRest = async () => { const rest = waitMs - (Date.now() - t0); if (rest > 0) await sleep(rest); };
  let link: Link | null;
  try { link = await getLink(); } catch { link = null; }
  if (!link) {
    const tick = setInterval(() => opts.onTick?.(Math.floor((Date.now() - t0) / 1000), 1), 250);
    try { await waitRest(); } finally { clearInterval(tick); }
    if (signal.cancelled) throw new PartyError('cancelled');
    return soloParty(me);
  }
  const lobby = await link.join(partyLobby(game));
  type Out = { kind: 'host'; group: string[] } | { kind: 'guest'; code: string } | { kind: 'cancel' };
  const out = await new Promise<Out>((resolve) => {
    let done = false;
    const finish = (o: Out) => { if (done) return; done = true; off(); clearInterval(iv); resolve(o); };
    const off = lobby.on('pgo', (d: { code: string; ids: string[] }) => { if (Array.isArray(d?.ids) && d.ids.includes(lobby.me)) finish({ kind: 'guest', code: d.code }); });
    const iv = setInterval(() => {
      if (signal.cancelled) { finish({ kind: 'cancel' }); return; }
      const group = groupOf(lobby.members(), lobby.me) ?? [lobby.me];
      const waited = Date.now() - t0;
      opts.onTick?.(Math.floor(waited / 1000), group.length);
      // The longest waiter in the group starts when it is full or the wait is over.
      // A guest whose host vanished takes over the same way; a safety stop after that.
      if (group[0] === lobby.me && (group.length >= PARTY_MAX || waited >= waitMs)) finish({ kind: 'host', group });
      else if (waited >= waitMs + 8000) finish({ kind: 'host', group: [lobby.me] });
    }, 200);
  });
  if (out.kind === 'cancel') { lobby.leave(); throw new PartyError('cancelled'); }
  if (out.kind === 'guest') {
    lobby.leave();
    try { return await joinOn(link, game, out.code, me, signal, 5000); } catch (e) {
      if (e instanceof PartyError && e.code === 'cancelled') throw e;
      return soloParty(me);
    }
  }
  const guests = out.group.filter((id) => id !== lobby.me);
  if (!guests.length) { lobby.leave(); return soloParty(me); }
  let party: Party;
  try { party = await openOn(link, game, me); } catch { lobby.leave(); return soloParty(me); }
  // Call the group in (a few times, in case one is lost), and wait a little for them.
  const call = () => lobby.send('pgo', { code: party.code, ids: guests });
  call();
  const calls = [setTimeout(call, 400), setTimeout(call, 1100)];
  const until = Date.now() + 3500;
  while (Date.now() < until && party.members().length < guests.length + 1 && !signal.cancelled) await sleep(100);
  calls.forEach(clearTimeout);
  setTimeout(() => lobby.leave(), 400);
  if (signal.cancelled) { party.close(); throw new PartyError('cancelled'); }
  return party;
}
