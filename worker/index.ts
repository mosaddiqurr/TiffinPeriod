// Tiffin Period on Cloudflare: one Worker serves the built site (dist/) and runs online play.
//
// Online play is a set of named channels (`tp:<game>:room:<code>`, `tp:<game>:lobby`, ...).
// Each channel is one Durable Object ("Room") that holds the players' WebSockets, tells
// everyone who is here (presence) and passes small messages between them. Nothing is stored:
// a channel exists only while someone is connected to it.
//
// Wire format (JSON text frames):
//   server → client  {t:'hello', me, members}   once, right after connecting
//                    {t:'join', member} / {t:'leave', id}
//                    {t:'msg', type, data, from}
//   client → server  {type, data}               relayed to everyone else in the channel
//   "ping" → "pong"  keep-alive, answered without waking the Room

import { DurableObject } from 'cloudflare:workers';

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

interface Member { id: string; joinedAt: number }

/** Channel names the games use. Anything else is refused. */
const CHANNEL = /^tp:[a-z0-9-]{1,40}:[a-z0-9:-]{1,60}$/i;
/** Largest message a player may send (a game move or a short chat line is far smaller). */
const MAX_FRAME = 16 * 1024;
/** Most players one channel holds (lobbies included). */
const MAX_MEMBERS = 200;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/rt/ping') return new Response('pong', { headers: { 'cache-control': 'no-store' } });
    if (url.pathname === '/rt') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const ch = url.searchParams.get('ch') ?? '';
      if (!CHANNEL.test(ch)) return new Response('Unknown channel', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(ch)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alives are answered by Cloudflare itself, so an idle room can sleep (and costs nothing).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(): Promise<Response> {
    const here = this.members();
    if (here.length >= MAX_MEMBERS) return new Response('Channel full', { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    const me: Member = { id: crypto.randomUUID().replace(/-/g, '').slice(0, 12), joinedAt: Date.now() };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    server.send(JSON.stringify({ t: 'hello', me: me.id, members: [...here, me] }));
    this.broadcast({ t: 'join', member: me }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME) return;
    let p: { type?: unknown; data?: unknown };
    try { p = JSON.parse(raw); } catch { return; }
    const from = this.memberOf(ws);
    if (!from || typeof p?.type !== 'string' || p.type.length > 40) return;
    this.broadcast({ t: 'msg', type: p.type, data: p.data, from: from.id }, ws);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.gone(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private memberOf(ws: WebSocket): Member | null {
    return (ws.deserializeAttachment() as Member | null) ?? null;
  }

  private members(except?: WebSocket): Member[] {
    const out: Member[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const m = this.memberOf(ws);
      if (m) out.push(m);
    }
    return out;
  }

  private gone(ws: WebSocket): void {
    const m = this.memberOf(ws);
    if (!m) return;
    ws.serializeAttachment(null); // tell the others only once
    this.broadcast({ t: 'leave', id: m.id }, ws);
  }

  private broadcast(frame: object, except?: WebSocket): void {
    const s = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !this.memberOf(ws)) continue;
      try { ws.send(s); } catch { /* closing */ }
    }
  }
}
