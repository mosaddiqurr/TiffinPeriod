import type { Rng } from '../../engine/rng';
import type { BotEnd } from './bot';
import type { Peer } from './rooms';

// Score races for any game (Balloon Burst, Pakhir Ure, Paper Airplane, Paper Boat, …):
// both players play the same level (same seed, from the lobby's "cfg") at the same time on
// their own device, and send their progress. Nothing about the play itself crosses the wire,
// so it never lags; only scores do.
//
// Messages: "ready" (this side is loaded), "go" (the host starts the countdown once both are
// ready), "prog" { score, done, extra } a few times a second, and the last "prog" has done:true.

export interface RaceProgress { score: number; done: boolean; extra?: Record<string, number | string> }

export class RaceLink {
  opp: RaceProgress = { score: 0, done: false };
  private listeners = new Set<(p: RaceProgress) => void>();
  private startCbs = new Set<() => void>();
  private offs: Array<() => void> = [];
  private lastSent = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private latest: RaceProgress | null = null;
  private readyMe = false;
  private readyThem = false;
  started = false;

  constructor(private peer: Peer) {
    this.offs.push(
      peer.on('prog', (p: RaceProgress) => { this.opp = p; this.listeners.forEach((cb) => cb(p)); }),
      peer.on('ready', () => { this.readyThem = true; this.maybeGo(); }),
      peer.on('go', () => this.start()),
    );
  }

  /** Call when this side has loaded; the race starts when both have. */
  ready() { if (this.readyMe) return; this.readyMe = true; this.peer.send('ready'); this.maybeGo(); }
  private maybeGo() { if (this.peer.host && this.readyMe && this.readyThem && !this.started) { this.peer.send('go'); this.start(); } }
  private start() { if (this.started) return; this.started = true; this.startCbs.forEach((cb) => cb()); }
  onStart(cb: () => void) { this.startCbs.add(cb); if (this.started) cb(); return () => this.startCbs.delete(cb); }
  onOpp(cb: (p: RaceProgress) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  /** Report my progress; sent at most 4 times a second, and always when done. */
  report(p: RaceProgress) {
    this.latest = p;
    const now = Date.now();
    if (p.done || now - this.lastSent > 250) { this.flush(); return; }
    if (!this.pendingTimer) this.pendingTimer = setTimeout(() => this.flush(), 250 - (now - this.lastSent));
  }
  private flush() {
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    if (!this.latest) return;
    this.lastSent = Date.now();
    this.peer.send('prog', this.latest);
  }
  dispose() { this.offs.forEach((f) => f()); if (this.pendingTimer) clearTimeout(this.pendingTimer); this.listeners.clear(); this.startCbs.clear(); }
}

/**
 * A stand-in for a score race: it says ready, waits for "go", then raises its score toward
 * `final` over `seconds` with small random steps, and finishes. `final` should be a score a
 * fair player gets on this level (use the game's own computer player to estimate it).
 */
export function raceBrain(o: { seconds: number; final: (rng: Rng) => number; extra?: (t: number) => Record<string, number | string>; speed?: number }) {
  return (end: BotEnd, ctx: { rng: Rng }) => {
    const speed = o.speed ?? 1;
    let iv: ReturnType<typeof setInterval> | null = null;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      const final = Math.max(0, Math.round(o.final(ctx.rng)));
      const t0 = Date.now();
      let score = 0;
      const total = (o.seconds * 1000) / speed;
      iv = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / total);
        // Uneven progress: quick bursts and quiet spells, like a person.
        const target = Math.round(final * (k * 0.85 + (k * k) * 0.15));
        if (target > score && ctx.rng.chance(0.65)) score = Math.min(target, score + Math.max(1, Math.round((target - score) * ctx.rng.range(0.4, 1))));
        const done = k >= 1;
        if (done) score = final;
        end.send('prog', { score, done, extra: o.extra?.(k) });
        if (done && iv) { clearInterval(iv); iv = null; }
      }, 400 / speed);
    };
    const offs = [end.on('ready', () => { end.send('ready'); }), end.on('go', begin)];
    // The stand-in is the host: it starts when the player is ready.
    const offReady = end.on('ready', () => setTimeout(() => { end.send('go'); begin(); }, 300 / speed));
    return () => { offs.forEach((f) => f()); offReady(); if (iv) clearInterval(iv); };
  };
}
