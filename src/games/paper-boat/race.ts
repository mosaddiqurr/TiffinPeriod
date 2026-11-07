import { createRng, type Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { BoatAI, RIVER, makeObstacles, newBoat, stepBoat, stepObstacles, type Boat, type Obstacle } from './model';

// Paper Boat online: a race on RaceLink (src/platform/net/race.ts). Both players sail the
// SAME stream, built from the lobby seed and the game number, at the same time on their
// own device. Each device is the only authority over its own boat: it sends where the boat
// is a few times a second ("prog" with `extra` = BoatReport), and the other side draws it
// as a see-through ghost. The last report has done:true and the boat's final state, and both
// devices decide the result from the same two final reports with the game's own ranking:
// finished boats by time, then boats still afloat by distance, then sunk boats by distance.
// Once one boat finishes, the other has 8 more seconds (like the offline race); 120 s at most.

export type Stream = 'normal' | 'wild';
export interface PBSettings { stream: Stream }
export const GAME = 'paper-boat';
export const QUICK: PBSettings = { stream: 'normal' };
export const GRACE_S = 8;
export const LIMIT_S = 120;
export const COUNTDOWN_S = 3;
/** Where the online boat starts (the middle lane of the offline race). */
export const START_X = 320;

/** 0 racing, 1 finished, 2 sunk, 3 did not finish (still afloat when time ran out). */
export type BoatStatus = 0 | 1 | 2 | 3;
/** What a device says about its own boat. Integers only, so both sides read the same numbers. */
export interface BoatReport { [k: string]: number; g: number; x: number; y: number; h: number; soak: number; st: BoatStatus; t: number; bumps: number }

export function courseSeed(seed: number, game: number): number { return (seed + game * 7919) >>> 0; }

export function makeCourse(seed: number, game: number, s: PBSettings): Obstacle[] {
  return makeObstacles(createRng(courseSeed(seed, game)), s.stream === 'wild' ? [80, 135] : [110, 190]);
}

/** Progress along the stream, 0 to 1000. */
export const progress = (y: number) => Math.round(1000 * Math.max(0, Math.min(1, 1 - y / (RIVER.len - 120))));

export function report(g: number, b: Boat, st: BoatStatus, t: number): BoatReport {
  return { g, x: Math.round(b.x), y: Math.round(Math.max(0, b.y)), h: Math.round(b.heading * 100), soak: Math.round(b.soak * 100), st, t: Math.round(Math.max(0, t) * 100), bumps: b.bumps };
}

/** Ranking key, lower is better (the offline race's own order). */
export function rankKey(r: BoatReport): number {
  if (r.st === 1) return r.t;
  if (r.st === 2) return 2e7 + r.y;
  return 1e7 + r.y;
}

/** 'win' | 'loss' | 'tie' for `mine` against `theirs`. Both devices get the mirror result. */
export function decide(mine: BoatReport, theirs: BoatReport): 'win' | 'loss' | 'tie' {
  const a = rankKey(mine), b = rankKey(theirs);
  return a === b ? 'tie' : a < b ? 'win' : 'loss';
}

// ---------- The stand-in ----------

/**
 * Sails its own boat with the game's computer steering (BoatAI) on the same course, in real
 * time (`speed` > 1 for tests), and reports like a player: a few times a second, then done.
 * It is the host: it answers "ready" with "ready" and "go". It accepts rematches.
 */
export function boatBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: PBSettings; seed: number }) => {
    const rng = ctx.rng;
    let g = 1;
    let state: 'waiting' | 'racing' | 'done' = 'waiting';
    let iv: ReturnType<typeof setInterval> | undefined;
    let wantRematch = false;
    let oppFinished = false;
    let rematchTimer: ReturnType<typeof setTimeout> | undefined;
    let readying = false;

    const begin = () => {
      if (state !== 'waiting') return;
      state = 'racing';
      readying = false;
      oppFinished = false;
      const obs = makeCourse(ctx.seed, g, ctx.settings);
      const boat = newBoat(START_X);
      const ai = new BoatAI(rng, rng.range(0.72, 0.92));
      const t0 = Date.now();
      let simT = -COUNTDOWN_S;
      let lastSent = 0;
      let endAt: number | null = null;
      const step = 1 / 120;
      iv = setInterval(() => {
        const target = ((Date.now() - t0) / 1000) * speed - COUNTDOWN_S;
        let st: BoatStatus = 0;
        while (simT < target) {
          simT += step;
          if (simT <= 0) continue;
          stepObstacles(obs, step);
          ai.update(boat, obs);
          stepBoat(boat, obs, step);
          if (oppFinished && endAt === null) endAt = simT + GRACE_S;
          if (boat.finished) { st = 1; break; }
          if (boat.sunk) { st = 2; break; }
          if (simT >= LIMIT_S || (endAt !== null && simT >= endAt)) { st = 3; break; }
        }
        const done = st !== 0;
        const now = Date.now();
        if (simT > 0 && (done || (now - lastSent) * speed >= 250)) {
          lastSent = now;
          const r = report(g, boat, st, simT);
          end.send('prog', { score: progress(r.y), done, extra: r });
        }
        if (done) { clearInterval(iv); iv = undefined; state = 'done'; }
      }, 40 / Math.min(speed, 4));
    };

    const offs = [
      end.on('ready', () => {
        if (state !== 'waiting' || readying) return;
        readying = true;
        end.send('ready');
        setTimeout(() => { if (state !== 'waiting') return; end.send('go'); begin(); }, 300 / speed);
      }),
      end.on('prog', (p: { extra?: BoatReport }) => { if (p.extra && p.extra.g === g && p.extra.st === 1) oppFinished = true; }),
      end.on('rematch', () => {
        if (wantRematch) return;
        wantRematch = true;
        rematchTimer = setTimeout(() => {
          end.send('rematch');
          g += 1;
          wantRematch = false;
          state = 'waiting';
        }, thinkMs(rng, 1, 2.4, speed));
      }),
    ];
    return () => { offs.forEach((f) => f()); if (iv) clearInterval(iv); clearTimeout(rematchTimer); };
  };
}

export function makeBoatBot(me: Profile, settings: PBSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: boatBrain(speed), speed });
}
