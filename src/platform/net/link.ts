// The wire for online play: named channels with presence (who is here) and small messages.
//
// - InsForge Realtime when VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY are set (production).
//   Players connect anonymously: no accounts. One backend channel pattern, `tp:%`, covers
//   every game (see migrations/…_online-play-channels.sql).
// - Otherwise (or with localStorage `tp.net` = "local") a BroadcastChannel stand-in, so two
//   tabs of the same browser can play each other while developing and in tests.
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
  kind: 'insforge' | 'local';
  join(channel: string): Promise<Chan>;
}

const sortMembers = (m: Member[]) => [...m].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));

// ---------- InsForge ----------

type RT = {
  connect(): Promise<void>;
  subscribe(ch: string): Promise<{ ok: boolean; error?: { message?: string }; presence?: { members: Array<{ presenceId: string; joinedAt?: string }> } }>;
  unsubscribe(ch: string): void;
  publish(ch: string, event: string, payload: unknown): Promise<unknown>;
  on(event: string, cb: (p: any) => void): void;
  off(event: string, cb: (p: any) => void): void;
  socketId?: string;
};

const sameChannel = (meta: string | undefined, ch: string) => !!meta && (meta === ch || meta.endsWith(':' + ch) || meta === 'realtime:' + ch);

async function insforgeLink(url: string, key: string): Promise<Link> {
  const { createClient } = await import('@insforge/sdk');
  const client = createClient({ baseUrl: url, anonKey: key });
  const rt = client.realtime as unknown as RT;
  await rt.connect();
  return {
    kind: 'insforge',
    async join(name: string): Promise<Chan> {
      const res = await rt.subscribe(name);
      if (!res.ok) throw new Error(res.error?.message || 'subscribe failed');
      const me = rt.socketId ?? '';
      let members: Member[] = (res.presence?.members ?? []).map((m) => ({ id: m.presenceId, joinedAt: m.joinedAt ? Date.parse(m.joinedAt) : Date.now() }));
      if (!members.some((m) => m.id === me)) members.push({ id: me, joinedAt: Date.now() });
      members = sortMembers(members);
      const handlers = new Map<string, Set<(d: any, from: string) => void>>();
      const pres = new Set<(m: Member[]) => void>();
      const onMsg = (p: any) => {
        if (!sameChannel(p?.meta?.channel, name) || p?.from === me) return;
        handlers.get(p.type)?.forEach((cb) => cb(p.data, p.from));
      };
      const onJoin = (m: any) => {
        if (!sameChannel(m?.meta?.channel, name)) return;
        const id = m.member.presenceId;
        if (!members.some((x) => x.id === id)) members = sortMembers([...members, { id, joinedAt: m.member.joinedAt ? Date.parse(m.member.joinedAt) : Date.now() }]);
        pres.forEach((cb) => cb(members));
      };
      const onLeave = (m: any) => {
        if (!sameChannel(m?.meta?.channel, name)) return;
        members = members.filter((x) => x.id !== m.member.presenceId);
        pres.forEach((cb) => cb(members));
      };
      rt.on('tp', onMsg); rt.on('presence:join', onJoin); rt.on('presence:leave', onLeave);
      let left = false;
      return {
        name, me,
        members: () => members,
        send: (type, data) => { if (!left) void rt.publish(name, 'tp', { type, data, from: me }).catch(() => {}); },
        on: (type, cb) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type)!.add(cb); return () => handlers.get(type)?.delete(cb); },
        onPresence: (cb) => { pres.add(cb); return () => pres.delete(cb); },
        leave: () => {
          if (left) return;
          left = true;
          rt.off('tp', onMsg); rt.off('presence:join', onJoin); rt.off('presence:leave', onLeave);
          try { rt.unsubscribe(name); } catch { /* already gone */ }
        },
      };
    },
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

export function onlineConfigured(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return !!(env.VITE_INSFORGE_URL && env.VITE_INSFORGE_ANON_KEY);
}

function forcedLocal(): boolean {
  try { return localStorage.getItem('tp.net') === 'local'; } catch { return false; }
}

/** The shared link (one connection for the whole app). */
export function getLink(): Promise<Link> {
  if (linkP) return linkP;
  const env = import.meta.env as Record<string, string | undefined>;
  linkP = (onlineConfigured() && !forcedLocal() ? insforgeLink(env.VITE_INSFORGE_URL!, env.VITE_INSFORGE_ANON_KEY!) : Promise.resolve(localLink()))
    .catch((e) => { linkP = null; throw e; });
  return linkP;
}
