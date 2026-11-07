import { createRng, type Rng } from '../../engine/rng';
import { RaceLink, type RaceProgress } from '../../platform/net/race';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { PlaneAI, TYPES, makeCourse, simulateThrow, throwWind, type Challenge, type Fold } from './model';

// Paper Airplane online: a score race on RaceLink.
// The host picks the challenge and the fold. Both devices build the same course from the
// lobby seed, and throw k of the race has the same wind on both (throwWind(seed, k)).
// Each player flies their own throws on their own device; only scores cross the wire:
//   "prog" { score: best so far, done, extra: { g: game number, list: "120,80", f: 1 while flying } }
// When both are done, the higher best throw wins (the challenge's own throwScore), equal is a draw.
// A rematch starts game g + 1 with a fresh RaceLink (both say "ready" again).

export interface PPSettings { challenge: Challenge; fold: Fold }
export const THROWS = 3;
export const MOVE_SECONDS = 15;
export const PP_GAME = 'paper-plane';
export const PP_QUICK: PPSettings = { challenge: 'distance', fold: 'glider' };

export interface RaceSide { throws: number[]; best: number; done: boolean; flying: boolean }
const blank = (): RaceSide => ({ throws: [], best: 0, done: false, flying: false });

export type PeerLike = Pick<Peer, 'host' | 'send' | 'on'>;

export function parseProg(p: RaceProgress): RaceSide {
  const list = String(p.extra?.list ?? '').split(',').filter(Boolean).map(Number).filter((v) => Number.isFinite(v)).slice(0, THROWS);
  return { throws: list, best: list.length ? Math.max(...list) : Math.max(0, p.score | 0), done: !!p.done, flying: Number(p.extra?.f ?? 0) === 1 };
}

export function outcomeOf(me: RaceSide, opp: RaceSide): 'win' | 'loss' | 'tie' {
  return me.best === opp.best ? 'tie' : me.best > opp.best ? 'win' : 'loss';
}

/** One device's side of the race: my throws out, the other player's throws in. */
export class PlaneRace {
  g = 0;
  me: RaceSide = blank();
  opp: RaceSide = blank();
  started = false;
  private link: RaceLink | null = null;
  private subs = new Set<() => void>();
  private startSubs = new Set<() => void>();

  constructor(private peer: PeerLike) {}

  /** Start game g + 1 (the first game, or a rematch). Call `ready()` when the screen is loaded. */
  newGame() {
    this.link?.dispose();
    this.g += 1;
    const g = this.g;
    this.me = blank();
    this.opp = blank();
    this.started = false;
    const link = new RaceLink(this.peer as Peer);
    this.link = link;
    link.onOpp((p) => {
      if (Number(p.extra?.g ?? 0) !== g || this.g !== g) return;
      this.opp = parseProg(p);
      this.emit();
    });
    link.onStart(() => {
      if (this.g !== g) return;
      this.started = true;
      this.startSubs.forEach((cb) => cb());
      this.emit();
    });
    this.emit();
  }

  ready() { this.link?.ready(); }

  /** Report that my plane is in the air (or back on the roof). */
  flying(f: boolean) {
    if (this.me.done || this.me.flying === f) return;
    this.me = { ...this.me, flying: f };
    this.send();
  }

  /** One of my throws landed with this score. */
  myThrow(score: number) {
    if (this.me.done) return;
    const throws = [...this.me.throws, Math.max(0, Math.round(score))];
    this.me = { throws, best: Math.max(...throws), done: throws.length >= THROWS, flying: false };
    this.send();
  }

  private send() {
    this.link?.report({ score: this.me.best, done: this.me.done, extra: { g: this.g, list: this.me.throws.join(','), f: this.me.flying ? 1 : 0 } });
    this.emit();
  }

  get result(): 'win' | 'loss' | 'tie' | null {
    return this.me.done && this.opp.done ? outcomeOf(this.me, this.opp) : null;
  }

  onChange(cb: () => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  onStart(cb: () => void) { this.startSubs.add(cb); return () => { this.startSubs.delete(cb); }; }
  private emit() { this.subs.forEach((cb) => cb()); }
  dispose() { this.link?.dispose(); this.link = null; this.subs.clear(); this.startSubs.clear(); }
}

// ---------- The stand-in ----------

/**
 * The stand-in's throws for one game: the game's own computer pilot (PlaneAI) flies the very
 * same course, fold and winds the player has, so its score is real, not made up.
 */
export function botThrows(seed: number, s: PPSettings, skill: number, rng: Rng): Array<{ score: number; seconds: number }> {
  const course = makeCourse(createRng(seed), s.challenge);
  const ai = new PlaneAI(rng, skill);
  const out: Array<{ score: number; seconds: number }> = [];
  for (let i = 0; i < THROWS; i++) {
    const r = simulateThrow(course, TYPES[s.fold], throwWind(seed, i), ai, s.challenge);
    out.push({ score: r.score, seconds: r.seconds });
  }
  return out;
}

/** The stand-in's side: it is the race host, throws at a person's pace and answers rematches. */
export function planeBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: PPSettings; seed: number }) => {
    const rng = ctx.rng;
    // Easy or medium, like the computer opponent's two lower levels.
    const skill = rng.chance(0.5) ? 0.55 : 0.75;
    let g = 0;
    let waiting = true; // for the player's "ready" (the first game, or after a rematch)
    let timers: Array<ReturnType<typeof setTimeout>> = [];
    let answering = false;
    const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };

    const play = (game: number) => {
      const plan = botThrows(ctx.seed, ctx.settings, skill, rng);
      const list: number[] = [];
      const report = (flying: boolean) => {
        const done = list.length >= THROWS;
        end.send('prog', { score: list.length ? Math.max(...list) : 0, done, extra: { g: game, list: list.join(','), f: flying ? 1 : 0 } });
      };
      let wait = 1500 / speed; // the page folding, like on the player's screen
      plan.forEach((th, i) => {
        wait += thinkMs(rng, 1.6, 5.2, speed); // aiming
        const takeOff = wait;
        later(takeOff, () => { if (g === game) report(true); });
        wait += (th.seconds * 1000) / speed; // the flight
        later(wait, () => { if (g !== game) return; list.push(th.score); report(false); });
        if (i < THROWS - 1) wait += 2000 / speed; // watching where it landed
      });
    };

    const offs = [
      // The player is loaded: say ready too, then start the race as its host.
      end.on('ready', () => {
        if (!waiting) return;
        waiting = false;
        g += 1;
        end.send('ready');
        const game = g;
        later(300 / speed, () => { if (g !== game) return; end.send('go'); play(game); });
      }),
      end.on('rematch', () => {
        if (answering) return;
        answering = true;
        later(thinkMs(rng, 1, 2.4, speed), () => {
          timers.forEach(clearTimeout);
          timers = [];
          answering = false;
          waiting = true;
          end.send('rematch');
        });
      }),
    ];
    return () => { offs.forEach((f) => f()); timers.forEach(clearTimeout); };
  };
}

export function makePlaneBot(me: Profile, settings: PPSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: planeBrain(speed), speed });
}
