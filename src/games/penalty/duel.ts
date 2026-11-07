import { HUMAN_DIVE, decided, diveTo, flightTime, judge, nextKicker, type Outcome, type Shootout, type Shot } from './model';

// Online Penalty Shootout between two devices. Both run this same state machine; it only talks
// through `send` and the messages it is given, so it is tested by wiring two of them together.
//
// Sides: the host is side 0, the guest side 1 (side order of the kick tally). The seed decides
// who kicks first in game 1; the first kicker swaps in each rematch. Kicks alternate like a real
// shootout: `best` kicks each (3 or 5), then sudden death (model.ts `nextKicker` / `decided`).
//
// Each kick ("step", counting from 1 in each game): the shooter picks the shot (aim + power,
// already through `strike`) and the keeper picks a dive, AT THE SAME TIME and in secret:
//   1. each sends "commit" { g, step, h } with h = SHA-256 of "g:step:value:salt",
//   2. only when it has the other's fingerprint does it send "reveal" { g, step, v, salt },
//   3. each checks the other's value against its fingerprint ("cheat" if it does not match).
// Values are whole thousandths, so both devices start from identical numbers: the shot is
// "s:x,y,power" and the dive "d:x,y". Both then judge the kick with the same `judge()` and play
// the same animation. Floating point can still differ by a hair between phones, so the shooter
// is the authority: it sends "res" { g, step, o } and the keeper's side adopts that outcome.
// Rematch: "rematch" { g } from both.

export interface PKSetup { kicks: number }
export interface Dive { x: number; y: number }
export type PKPhase = 'pick' | 'over';
export type Side = 0 | 1;

export interface DuelLink {
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
}

export interface PKView {
  phase: PKPhase;
  game: number;
  mySide: Side;
  setup: PKSetup;
  so: Shootout;
  /** The kick being decided (1, 2, …). */
  step: number;
  /** Who shoots this kick. */
  kicker: Side;
  myLocked: boolean;
  theirLocked: boolean;
  winner: Side | null;
  rematch: { me: boolean; them: boolean };
  cheat: boolean;
}

export interface KickEvent {
  game: number;
  step: number;
  kicker: Side;
  shot: Shot;
  dive: Dive;
  outcome: Outcome;
  before: Shootout;
  after: Shootout;
}

const OUTCOMES: Outcome[] = ['goal', 'saved', 'post', 'wide', 'over'];
const other = (s: Side): Side => (s === 0 ? 1 : 0);
const q = (v: number) => Math.round(v * 1000);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function encodeShot(s: Shot): string { return `s:${q(clamp(s.x, -2.5, 2.5))},${q(clamp(s.y, 0, 2.5))},${q(clamp(s.power, 0, 1))}`; }
export function encodeDive(d: Dive): string { return `d:${q(clamp(d.x, -1, 1))},${q(clamp(d.y, 0, 1))}`; }

function ints(v: string, tag: string, count: number): number[] | null {
  if (typeof v !== 'string' || !v.startsWith(tag + ':')) return null;
  const parts = v.slice(2).split(',');
  if (parts.length !== count) return null;
  const n = parts.map(Number);
  return n.every((x) => Number.isInteger(x)) ? n : null;
}
export function decodeShot(v: string): Shot | null {
  const n = ints(v, 's', 3);
  if (!n || Math.abs(n[0]) > 2500 || n[1] < 0 || n[1] > 2500 || n[2] < 0 || n[2] > 1000) return null;
  return { x: n[0] / 1000, y: n[1] / 1000, power: n[2] / 1000 };
}
export function decodeDive(v: string): Dive | null {
  const n = ints(v, 'd', 2);
  if (!n || Math.abs(n[0]) > 1000 || n[1] < 0 || n[1] > 1000) return null;
  return { x: n[0] / 1000, y: n[1] / 1000 };
}

/** Where the keeper ends up (the dive is chosen before the kick, so it starts at once). */
export const keeperAt = (shot: Shot, dive: Dive) => diveTo(dive.x, dive.y, flightTime(shot.power), HUMAN_DIVE);
export const judgeKick = (shot: Shot, dive: Dive): Outcome => judge(shot, keeperAt(shot, dive));

async function sha(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (old browsers on plain http): FNV-1a, enough for a school game.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}
const salt = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

interface LogEntry { kicker: Side; outcome: Outcome }

export class PKDuel {
  private v: PKView;
  private log: LogEntry[] = [];
  private mine = new Map<number, { v: string; salt: string; revealed: boolean }>();
  private theirs = new Map<number, { h?: string; v?: string }>();
  private early = new Map<number, { g: number; step: number; v: string; salt: string }>();
  private resolving = new Set<number>();
  private resIn = new Map<number, Outcome>();
  private listeners = new Set<(v: PKView) => void>();
  private events = new Set<(e: KickEvent) => void>();
  private offs: Array<() => void> = [];
  private firstOfGame: Side;

  constructor(private link: DuelLink, mySide: Side, setup: PKSetup, seed: number) {
    this.firstOfGame = (seed % 2) as Side;
    const best = setup.kicks === 3 ? 3 : 5;
    const so: Shootout = { kicks: [[], []], first: this.firstOfGame, best };
    this.v = { phase: 'pick', game: 1, mySide, setup: { kicks: best }, so, step: 1, kicker: nextKicker(so), myLocked: false, theirLocked: false, winner: null, rematch: { me: false, them: false }, cheat: false };
    this.offs.push(
      link.on('commit', (d: { g: number; step: number; h: string }) => this.onCommit(d)),
      link.on('reveal', (d: { g: number; step: number; v: string; salt: string }) => void this.onReveal(d)),
      link.on('res', (d: { g: number; step: number; o: Outcome }) => this.onRes(d)),
      link.on('rematch', (d: { g: number }) => { if (d.g === this.v.game) { this.set({ rematch: { ...this.v.rematch, them: true } }); this.maybeRematch(); } }),
    );
  }

  get view(): PKView { return this.v; }
  /** My job this kick. */
  get role(): 'shoot' | 'keep' { return this.v.kicker === this.v.mySide ? 'shoot' : 'keep'; }
  onChange(cb: (v: PKView) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onEvent(cb: (e: KickEvent) => void) { this.events.add(cb); return () => this.events.delete(cb); }
  dispose() { this.offs.forEach((f) => f()); this.listeners.clear(); this.events.clear(); }

  private set(p: Partial<PKView>) { this.v = { ...this.v, ...p }; this.listeners.forEach((cb) => cb(this.v)); }

  /** Lock my shot (shooter) for this kick. */
  lockShot(s: Shot) { if (this.role === 'shoot') void this.lock(encodeShot(s)); }
  /** Lock my dive (keeper) for this kick. */
  lockDive(d: Dive) { if (this.role === 'keep') void this.lock(encodeDive(d)); }

  private async lock(value: string) {
    const { phase, step, game, myLocked } = this.v;
    if (phase !== 'pick' || myLocked || this.mine.has(step) || this.v.cheat) return;
    const s = salt();
    this.mine.set(step, { v: value, salt: s, revealed: false });
    this.set({ myLocked: true });
    const h = await sha(`${game}:${step}:${value}:${s}`);
    if (game !== this.v.game) return;
    this.link.send('commit', { g: game, step, h });
    this.maybeReveal(step);
  }

  askRematch() {
    if (this.v.phase !== 'over' || this.v.rematch.me) return;
    this.link.send('rematch', { g: this.v.game });
    this.set({ rematch: { ...this.v.rematch, me: true } });
    this.maybeRematch();
  }

  private maybeRematch() {
    if (!this.v.rematch.me || !this.v.rematch.them) return;
    this.mine.clear(); this.theirs.clear(); this.early.clear(); this.resolving.clear(); this.resIn.clear(); this.log = [];
    this.firstOfGame = other(this.firstOfGame);
    const so: Shootout = { kicks: [[], []], first: this.firstOfGame, best: this.v.so.best };
    this.set({ phase: 'pick', game: this.v.game + 1, so, step: 1, kicker: nextKicker(so), myLocked: false, theirLocked: false, winner: null, rematch: { me: false, them: false } });
  }

  private onCommit(d: { g: number; step: number; h: string }) {
    if (d.g !== this.v.game || typeof d.h !== 'string') return;
    const t = this.theirs.get(d.step) ?? {};
    if (t.h) return;
    this.theirs.set(d.step, { ...t, h: d.h });
    if (d.step === this.v.step) this.set({ theirLocked: true });
    this.maybeReveal(d.step);
    const e = this.early.get(d.step);
    if (e) { this.early.delete(d.step); void this.onReveal(e); }
  }

  private maybeReveal(step: number) {
    const m = this.mine.get(step), t = this.theirs.get(step);
    if (!m || !t?.h || m.revealed) return;
    m.revealed = true;
    this.link.send('reveal', { g: this.v.game, step, v: m.v, salt: m.salt });
    this.maybeResolve(step);
  }

  private async onReveal(d: { g: number; step: number; v: string; salt: string }) {
    if (d.g !== this.v.game) return;
    const t = this.theirs.get(d.step);
    if (!t?.h) { this.early.set(d.step, d); return; }
    if (t.v !== undefined) return;
    const h = await sha(`${d.g}:${d.step}:${d.v}:${d.salt}`);
    if (d.g !== this.v.game) return;
    if (h !== t.h) { this.set({ cheat: true }); return; }
    this.theirs.set(d.step, { ...t, v: d.v });
    this.maybeResolve(d.step);
  }

  private maybeResolve(step: number) {
    const m = this.mine.get(step), t = this.theirs.get(step);
    if (!m?.revealed || t?.v === undefined || this.resolving.has(step) || step !== this.v.step || this.v.phase !== 'pick') return;
    this.resolving.add(step);
    const kicker = this.v.kicker;
    const iShoot = kicker === this.v.mySide;
    const shot = decodeShot(iShoot ? m.v : t.v);
    const dive = decodeDive(iShoot ? t.v : m.v);
    if (!shot || !dive) { this.set({ cheat: true }); return; }
    let outcome = judgeKick(shot, dive);
    // The shooter's verdict may already be here.
    const theirs = this.resIn.get(step);
    if (!iShoot && theirs) outcome = theirs;
    const before = this.v.so;
    this.log.push({ kicker, outcome });
    const after = this.rebuild();
    const w = decided(after);
    const nextStep = step + 1;
    this.set({ so: after, step: nextStep, kicker: nextKicker(after), winner: w, phase: w === null ? 'pick' : 'over', myLocked: false, theirLocked: this.theirs.get(nextStep)?.h !== undefined });
    if (iShoot) this.link.send('res', { g: this.v.game, step, o: outcome });
    this.events.forEach((cb) => cb({ game: this.v.game, step, kicker, shot, dive, outcome, before, after }));
    // Their next fingerprint may already be here.
    this.maybeReveal(nextStep);
  }

  private rebuild(): Shootout {
    const kicks: [boolean[], boolean[]] = [[], []];
    for (const e of this.log) kicks[e.kicker].push(e.outcome === 'goal');
    return { kicks, first: this.firstOfGame, best: this.v.so.best };
  }

  /** The shooter's verdict. Normally the same as ours; if a phone rounded differently, theirs wins. */
  private onRes(d: { g: number; step: number; o: Outcome }) {
    if (d.g !== this.v.game || !OUTCOMES.includes(d.o)) return;
    const e = this.log[d.step - 1];
    if (!e) { this.resIn.set(d.step, d.o); return; }
    if (e.kicker === this.v.mySide || e.outcome === d.o) return;
    e.outcome = d.o;
    const so = this.rebuild();
    const w = decided(so);
    // Only the kick tally can change; a finished shootout may go on, or one going on may finish.
    this.set({ so, winner: w, kicker: nextKicker(so), phase: w === null ? 'pick' : 'over' });
  }
}
