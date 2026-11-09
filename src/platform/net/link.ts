// The wire for online play: named channels with presence (who is here) and small messages.
//
// - The Cloudflare Worker (worker/index.ts) in production: the built site talks to its own
//   address, or to VITE_RT_URL when that is set. Players connect anonymously: no accounts.
// - Otherwise (the Vite dev server, or with localStorage `tp.net` = "local") a BroadcastChannel
//   stand-in, so two tabs of the same browser can play each other while developing and in tests.
//
// Everything above this file (rooms, quick match, games) only sees the `Link` and `Chan` types.

export interface Member { id: string; joinedAt: number }

export interface Chan {
  name: string;
  /** My own id in this channel. */
  me: string;
  /** Everyone here now (me included), oldest first. */
  members(): Member[];
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any, from: string) => void): () => void;
  onPresence(cb: (members: Member[]) => void): () => void;
  leave(): void;
}

export interface Link {
  kind: 'cloudflare' | 'local';
  join(channel: string): Promise<Chan>;
}

const sortMembers = (m: Member[]) => [...m].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));

// ---------- Cloudflare (worker/index.ts) ----------
//
// One WebSocket per channel to `/rt?ch=<name>` on the server. Each channel is a Durable Object
// that says who is here and relays messages. See worker/index.ts for the wire format.

/** If no frame arrives for this long, a "ping" is sent so phones and proxies keep the socket open. */
const KEEPALIVE_MS = 25_000;

function wsURL(base: string, ch: string): string {
  const u = new URL('rt', base.endsWith('/') ? base : base + '/');
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.searchParams.set('ch', ch);
  return u.toString();
}

async function cloudflareLink(base: string): Promise<Link> {
  // Check the server is there before promising online play (callers fall back to a bot otherwise).
  const ping = await fetch(new URL('rt/ping', base.endsWith('/') ? base : base + '/'), { cache: 'no-store' });
  if (!ping.ok || (await ping.text()) !== 'pong') throw new Error('online server not reachable');
  return {
    kind: 'cloudflare',
    join: (name: string) => new Promise<Chan>((resolve, reject) => {
      const ws = new WebSocket(wsURL(base, name));
      let me = '';
      let members: Member[] = [];
      let left = false;
      let opened = false;
      const handlers = new Map<string, Set<(d: any, from: string) => void>>();
      const pres = new Set<(m: Member[]) => void>();
      const tell = () => pres.forEach((cb) => cb(members));
      const timer = setTimeout(() => { if (!opened) { reject(new Error('join timed out')); try { ws.close(); } catch { /* ignore */ } } }, 8000);
      const keep = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, KEEPALIVE_MS);
      const chan: Chan = {
        name,
        get me() { return me; },
        members: () => members,
        send: (type, data) => { if (!left && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data })); },
        on: (type, cb) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type)!.add(cb); return () => handlers.get(type)?.delete(cb); },
        onPresence: (cb) => { pres.add(cb); return () => pres.delete(cb); },
        leave: () => {
          if (left) return;
          left = true;
          clearInterval(keep);
          try { ws.close(1000, 'leave'); } catch { /* already closed */ }
        },
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data === 'pong') return;
        let f: any;
        try { f = JSON.parse(e.data); } catch { return; }
        if (f.t === 'hello') {
          me = String(f.me);
          members = sortMembers((f.members as Member[]) ?? []);
          opened = true;
          clearTimeout(timer);
          resolve(chan);
        } else if (f.t === 'join' && f.member) {
          if (!members.some((m) => m.id === f.member.id)) { members = sortMembers([...members, f.member]); tell(); }
        } else if (f.t === 'leave') {
          const before = members.length;
          members = members.filter((m) => m.id !== f.id);
          if (members.length !== before) tell();
        } else if (f.t === 'msg' && typeof f.type === 'string') {
          handlers.get(f.type)?.forEach((cb) => cb(f.data, f.from));
        }
      };
      ws.onclose = () => {
        clearInterval(keep);
        clearTimeout(timer);
        if (!opened) { reject(new Error('could not join')); return; }
        // Lost the connection: to this player, everyone else has left.
        if (!left && members.some((m) => m.id !== me)) { members = members.filter((m) => m.id === me); tell(); }
      };
    }),
  };
}

// ---------- Local (BroadcastChannel) ----------

function localLink(): Link {
  const bc = new BroadcastChannel('tp-local-net');
  const myId = Math.random().toString(36).slice(2, 10);
  type Frame = { ch: string; kind: 'join' | 'here' | 'leave' | 'msg'; id: string; at: number; type?: string; data?: unknown };
  const chans = new Map<string, { members: Map<string, number>; at: number; handlers: Map<string, Set<(d: any, f: string) => void>>; pres: Set<(m: Member[]) => void> }>();
  const list = (c: { members: Map<string, number> }) => sortMembers([...c.members].map(([id, joinedAt]) => ({ id, joinedAt })));
  bc.onmessage = (e: MessageEvent<Frame>) => {
    const f = e.data;
    const c = chans.get(f.ch);
    if (!c || f.id === myId) return;
    if (f.kind === 'join' || f.kind === 'here') {
      const had = c.members.has(f.id);
      c.members.set(f.id, f.at);
      if (f.kind === 'join') bc.postMessage({ ch: f.ch, kind: 'here', id: myId, at: c.at } satisfies Frame);
      if (!had) c.pres.forEach((cb) => cb(list(c)));
    } else if (f.kind === 'leave') {
      if (c.members.delete(f.id)) c.pres.forEach((cb) => cb(list(c)));
    } else if (f.kind === 'msg' && f.type) {
      c.handlers.get(f.type)?.forEach((cb) => cb(f.data, f.id));
    }
  };
  addEventListener('pagehide', () => { for (const ch of chans.keys()) bc.postMessage({ ch, kind: 'leave', id: myId, at: 0 } satisfies Frame); });
  return {
    kind: 'local',
    async join(name: string): Promise<Chan> {
      const at = Date.now();
      const c = { members: new Map<string, number>([[myId, at]]), at, handlers: new Map(), pres: new Set<(m: Member[]) => void>() };
      chans.set(name, c);
      bc.postMessage({ ch: name, kind: 'join', id: myId, at } satisfies Frame);
      // Give the others a moment to say they are here, like a presence snapshot.
      await new Promise((r) => setTimeout(r, 120));
      return {
        name, me: myId,
        members: () => list(c),
        send: (type, data) => { if (chans.get(name) === c) bc.postMessage({ ch: name, kind: 'msg', id: myId, at, type, data } satisfies Frame); },
        on: (type, cb) => { if (!c.handlers.has(type)) c.handlers.set(type, new Set()); c.handlers.get(type)!.add(cb); return () => c.handlers.get(type)?.delete(cb); },
        onPresence: (cb) => { c.pres.add(cb); return () => c.pres.delete(cb); },
        leave: () => { if (chans.get(name) !== c) return; chans.delete(name); bc.postMessage({ ch: name, kind: 'leave', id: myId, at } satisfies Frame); },
      };
    },
  };
}

// ---------- Pick one ----------

let linkP: Promise<Link> | null = null;

/** Where the online server is, or null to play over the local stand-in. */
function serverBase(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_RT_URL) return env.VITE_RT_URL;
  if (!import.meta.env.PROD || typeof location === 'undefined') return null;
  return new URL('./', location.href).toString();
}

export function onlineConfigured(): boolean {
  return serverBase() !== null;
}

function forcedLocal(): boolean {
  try { return localStorage.getItem('tp.net') === 'local'; } catch { return false; }
}

/** The shared link (one per app; each channel opens its own connection). */
export function getLink(): Promise<Link> {
  if (linkP) return linkP;
  const base = serverBase();
  linkP = (base && !forcedLocal() ? cloudflareLink(base) : Promise.resolve(localLink()))
    .catch((e) => { linkP = null; throw e; });
  return linkP;
}
