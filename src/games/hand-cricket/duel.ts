import { battingSide, newMatch, other, playBall, tossWinner, type BallRecord, type HCConfig, type HCState, type Side } from './logic';

// Online Hand Cricket between two devices. Both run this same state machine; it only talks
// through `send` and the messages it is given, so it is tested by wiring two of them together.
//
// Fair secret numbers (commit, then reveal): for every pick (the toss and each ball)
//   1. you send a fingerprint of your number: SHA-256 of "game:step:number:salt",
//   2. only when you have the other player's fingerprint do you send your number and salt,
//   3. each side checks the other's number against its fingerprint.
// Nobody can see the other's number before locking their own, or change it afterwards.
//
// Sides: the host is side 0, the guest side 1. The guest calls the toss in the first game;
// the caller swaps in each rematch.

export interface DuelSetup { overs: number; wickets: number }
export type DuelPhase = 'wait' | 'call' | 'tossPick' | 'choose' | 'play' | 'over';

export interface DuelLink {
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
}

export interface DuelView {
  phase: DuelPhase;
  game: number;
  mySide: Side;
  setup: DuelSetup | null;
  caller: Side;
  call: 'odd' | 'even' | null;
  tossNums: [number, number] | null;
  tossWin: Side | null;
  match: HCState | null;
  step: number;
  myPick: number | null;
  theirLocked: boolean;
  rematch: { me: boolean; them: boolean };
  cheat: boolean;
}

export type DuelEvent =
  | { kind: 'toss'; nums: [number, number]; winner: Side }
  | { kind: 'ball'; rec: BallRecord; picks: [number, number]; before: HCState; after: HCState };

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

export class HCDuel {
  private v: DuelView;
  private mine = new Map<string, { n: number; salt: string; h: string; revealed: boolean }>();
  private theirs = new Map<string, { h?: string; n?: number; salt?: string }>();
  private listeners = new Set<(v: DuelView) => void>();
  private events = new Set<(e: DuelEvent) => void>();
  private offs: Array<() => void> = [];
  private resolving = new Set<string>();
  /** A reveal that arrived before its fingerprint (kept until the fingerprint comes). */
  private early = new Map<string, { g: number; step: number; n: number; salt: string }>();

  constructor(private link: DuelLink, mySide: Side, setup?: DuelSetup) {
    this.v = { phase: 'wait', game: 1, mySide, setup: setup ?? null, caller: 1, call: null, tossNums: null, tossWin: null, match: null, step: 0, myPick: null, theirLocked: false, rematch: { me: false, them: false }, cheat: false };
    this.offs.push(
      link.on('setup', (d: DuelSetup) => { if (!this.v.setup) this.set({ setup: { overs: d.overs, wickets: d.wickets }, phase: 'call' }); }),
      link.on('call', (d: { g: number; call: 'odd' | 'even' }) => { if (d.g === this.v.game && this.v.phase === 'call') this.set({ call: d.call, phase: 'tossPick' }); }),
      link.on('commit', (d: { g: number; step: number; h: string }) => this.onCommit(d)),
      link.on('reveal', (d: { g: number; step: number; n: number; salt: string }) => void this.onReveal(d)),
      link.on('choose', (d: { g: number; batFirst: boolean }) => { if (d.g === this.v.game && this.v.phase === 'choose') this.begin(d.batFirst ? other(this.v.mySide) : this.v.mySide); }),
      link.on('rematch', (d: { g: number }) => { if (d.g === this.v.game) { this.set({ rematch: { ...this.v.rematch, them: true } }); this.maybeRematch(); } }),
    );
    if (mySide === 0 && setup) { link.send('setup', setup); this.v = { ...this.v, phase: 'call' }; }
  }

  get view(): DuelView { return this.v; }
  onChange(cb: (v: DuelView) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onEvent(cb: (e: DuelEvent) => void) { this.events.add(cb); return () => this.events.delete(cb); }
  dispose() { this.offs.forEach((f) => f()); this.listeners.clear(); this.events.clear(); }

  private set(p: Partial<DuelView>) { this.v = { ...this.v, ...p }; this.emit(); }
  private emit() { this.listeners.forEach((cb) => cb(this.v)); }
  private key(step: number, g = this.v.game) { return `${g}:${step}`; }
  get iCall() { return this.v.caller === this.v.mySide; }
  get iChoose() { return this.v.tossWin === this.v.mySide; }

  /** The caller says odd or even. */
  callToss(call: 'odd' | 'even') {
    if (this.v.phase !== 'call' || !this.iCall) return;
    this.link.send('call', { g: this.v.game, call });
    this.set({ call, phase: 'tossPick' });
  }

  /** Lock my number for the toss or this ball. */
  async pick(n: number) {
    const { phase, myPick } = this.v;
    if ((phase !== 'tossPick' && phase !== 'play') || myPick !== null || !Number.isInteger(n) || n < 1 || n > 6) return;
    const step = phase === 'tossPick' ? 0 : this.v.step;
    const k = this.key(step);
    if (this.mine.has(k)) return;
    const s = salt();
    this.set({ myPick: n });
    const h = await sha(`${this.v.game}:${step}:${n}:${s}`);
    this.mine.set(k, { n, salt: s, h, revealed: false });
    this.link.send('commit', { g: this.v.game, step, h });
    this.maybeReveal(step);
  }

  /** The toss winner chooses to bat or bowl first. */
  choose(batFirst: boolean) {
    if (this.v.phase !== 'choose' || !this.iChoose) return;
    this.link.send('choose', { g: this.v.game, batFirst });
    this.begin(batFirst ? this.v.mySide : other(this.v.mySide));
  }

  askRematch() {
    if (this.v.phase !== 'over' || this.v.rematch.me) return;
    this.link.send('rematch', { g: this.v.game });
    this.set({ rematch: { ...this.v.rematch, me: true } });
    this.maybeRematch();
  }

  private maybeRematch() {
    if (!this.v.rematch.me || !this.v.rematch.them) return;
    this.mine.clear(); this.theirs.clear(); this.early.clear();
    this.set({ game: this.v.game + 1, caller: other(this.v.caller), call: null, tossNums: null, tossWin: null, match: null, step: 0, myPick: null, theirLocked: false, rematch: { me: false, them: false }, phase: 'call' });
  }

  private begin(battingFirst: Side) {
    const s = this.v.setup!;
    const cfg: HCConfig = { overs: s.overs, wickets: s.wickets };
    this.set({ match: newMatch(cfg, battingFirst), phase: 'play', step: 1, myPick: null, theirLocked: false });
  }

  private onCommit(d: { g: number; step: number; h: string }) {
    if (d.g !== this.v.game) return;
    const k = this.key(d.step);
    const t = this.theirs.get(k) ?? {};
    if (t.h) return;
    this.theirs.set(k, { ...t, h: d.h });
    if (d.step === this.currentStep()) this.set({ theirLocked: true });
    this.maybeReveal(d.step);
    const e = this.early.get(k);
    if (e) { this.early.delete(k); void this.onReveal(e); }
  }

  private currentStep() { return this.v.phase === 'tossPick' ? 0 : this.v.step; }

  private maybeReveal(step: number) {
    const k = this.key(step);
    const m = this.mine.get(k), t = this.theirs.get(k);
    if (!m || !t?.h || m.revealed) return;
    m.revealed = true;
    this.link.send('reveal', { g: this.v.game, step, n: m.n, salt: m.salt });
    void this.maybeResolve(step);
  }

  private async onReveal(d: { g: number; step: number; n: number; salt: string }) {
    if (d.g !== this.v.game) return;
    const k = this.key(d.step);
    const t = this.theirs.get(k);
    if (!t?.h) { this.early.set(k, d); return; }
    if (t.n !== undefined) return;
    const h = await sha(`${d.g}:${d.step}:${d.n}:${d.salt}`);
    if (h !== t.h || !Number.isInteger(d.n) || d.n < 1 || d.n > 6) { this.set({ cheat: true }); return; }
    this.theirs.set(k, { ...t, n: d.n, salt: d.salt });
    await this.maybeResolve(d.step);
  }

  private async maybeResolve(step: number) {
    const k = this.key(step);
    const m = this.mine.get(k), t = this.theirs.get(k);
    if (!m?.revealed || t?.n === undefined || this.resolving.has(k)) return;
    if (step !== this.currentStep()) return;
    this.resolving.add(k);
    const me = this.v.mySide;
    const picks: [number, number] = me === 0 ? [m.n, t.n] : [t.n, m.n];
    if (step === 0) {
      const winner = tossWinner(this.v.caller, this.v.call ?? 'odd', picks[0], picks[1]);
      this.set({ tossNums: picks, tossWin: winner, phase: 'choose', myPick: null, theirLocked: false });
      this.events.forEach((cb) => cb({ kind: 'toss', nums: picks, winner }));
      return;
    }
    const before = this.v.match!;
    const bat = battingSide(before);
    const after = playBall(before, picks[bat], picks[other(bat)]);
    const nextStep = step + 1;
    this.set({ match: after, step: nextStep, myPick: null, theirLocked: this.theirs.get(this.key(nextStep))?.h !== undefined, phase: after.done ? 'over' : 'play' });
    this.events.forEach((cb) => cb({ kind: 'ball', rec: after.last!, picks, before, after }));
    // Their next commit may already be here.
    this.maybeReveal(nextStep);
  }
}
