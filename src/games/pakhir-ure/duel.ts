import { createRng, type Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { RaceProgress } from '../../platform/net/race';
import type { Peer, Profile } from '../../platform/net/rooms';
import { AI_PROFILE, PakhirEngine, type Difficulty, type InputStyle, type Phase } from './engine';
import { ITEMS } from './items';

// Pakhir Ure online: a score race. Both players get the same calls in the same order: the
// engine for game g is seeded from the lobby's seed and g, and a one-player engine draws
// exactly the same random numbers per call whatever the player does. Each device plays on
// its own and sends only its progress through RaceLink ("prog" { score, done, extra }).
// The higher final score wins; equal scores are a draw.

export interface PUSettings { calls: number; input: InputStyle }
export const GAME = 'pakhir-ure';
/** Quick match: the same as the vs-computer game (20 calls, lift finger). */
export const QUICK: PUSettings = { calls: 20, input: 'lift' };
export const CALL_CHOICES = [10, 20, 30];

/** The seed for game g (1 = first game, 2 = first rematch, …). */
export function gameSeed(seed: number, g: number): number {
  return (seed ^ Math.imul(g, 0x9e3779b1)) >>> 0;
}

/** One player's engine for an online game. Same settings + seed + g → the same calls. */
export function raceEngine(s: PUSettings, seed: number, g: number, extraMs = 0): PakhirEngine {
  return new PakhirEngine({ players: [{ ai: false }], input: s.input, lives: null, calls: s.calls, aiDifficulty: 'medium', extraMs }, ITEMS, createRng(gameSeed(seed, g)));
}

/** The call number to show: the call in progress, or the last one finished. */
export function shownCall(e: PakhirEngine): number {
  return Math.min(e.callIndex + (e.phase === 'call' ? 1 : 0), e.cfg.calls ?? 0);
}

export function progressOf(e: PakhirEngine): RaceProgress {
  return { score: e.players[0].score, done: e.phase === 'over', extra: { call: shownCall(e), of: e.cfg.calls ?? 0 } };
}

export interface Step { at: number; p: RaceProgress }

/**
 * Plays a whole online game the way the computer player does at `level`, with a person's
 * pace (putting the finger back down takes a moment). Returns the progress over time (ms
 * from the start) and the calls it heard. Decisions use `rng`, never the engine's own.
 */
export function simulateRun(s: PUSettings, seed: number, g: number, level: Difficulty, rng: Rng): { steps: Step[]; items: string[]; final: number } {
  const e = raceEngine(s, seed, g);
  const prof = AI_PROFILE[level];
  const steps: Step[] = [];
  const items: string[] = [];
  let t = 0;
  let downAt: number | null = s.input === 'lift' ? rng.range(400, 1100) : null;
  let actAt: number | null = null;
  let last: Phase = e.phase;
  for (let i = 0; i < 500000 && e.phase !== 'over'; i++) {
    t += 10;
    if (downAt !== null && t >= downAt) { e.press(0, t); downAt = null; }
    if (actAt !== null && t >= actAt) { if (s.input === 'lift') e.release(0, t); else e.press(0, t); actAt = null; }
    e.tick(t);
    const ph = e.phase as Phase;
    if (ph === last) continue;
    last = ph;
    if (ph === 'call' && e.item) {
      items.push(e.item.id);
      const wrong = rng.chance(e.item.tricky ? prof.trickyErr : prof.err);
      const rt = Math.max(250, prof.mean + rng.gauss() * prof.sd);
      actAt = e.item.flies !== wrong ? t + Math.min(rt, e.windowMs - 30) : null;
      steps.push({ at: t, p: progressOf(e) });
    } else if (ph === 'reveal' || ph === 'over') {
      steps.push({ at: t, p: progressOf(e) });
    } else if (ph === 'ready' && s.input === 'lift' && !e.players[0].holding) {
      downAt = t + rng.range(250, 900);
    }
  }
  return { steps, items, final: e.players[0].score };
}

/** The quick-match stand-in: plays each game with the computer player's brain, easy or medium. */
export function pakhirBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: PUSettings; seed: number }) => {
    const rng = ctx.rng;
    let g = 1;
    let state: 'wait' | 'play' | 'done' = 'wait';
    let wantRematch = false;
    let timers: Array<ReturnType<typeof setTimeout>> = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const answerRematch = () => {
      wantRematch = false;
      later(() => {
        end.send('rematch');
        g += 1;
        state = 'wait';
      }, thinkMs(rng, 1, 2.4, speed));
    };
    const play = () => {
      state = 'play';
      const run = simulateRun(ctx.settings, ctx.seed, g, rng.chance(0.55) ? 'medium' : 'easy', rng);
      end.send('prog', { score: 0, done: false, extra: { call: 0, of: ctx.settings.calls } });
      for (const st of run.steps) {
        later(() => {
          end.send('prog', st.p);
          if (st.p.done) { state = 'done'; if (wantRematch) answerRematch(); }
        }, st.at / speed);
      }
    };
    const offs = [
      // The stand-in is the host: when the player is ready it is ready too, and starts.
      end.on('ready', () => {
        if (state !== 'wait') return;
        end.send('ready');
        later(() => { end.send('go'); play(); }, 300 / speed);
      }),
      end.on('rematch', () => {
        if (wantRematch) return;
        wantRematch = true;
        if (state === 'done') answerRematch();
      }),
    ];
    return () => { offs.forEach((f) => f()); clear(); };
  };
}

export function makePakhirBot(me: Profile, settings: PUSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: pakhirBrain(speed), speed });
}
