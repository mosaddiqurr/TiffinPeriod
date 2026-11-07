import type { Rng } from '../../engine/rng';
import { createRng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { PENS, PenAI, PenWorld, STEP, startPoses, type Flick, type PenId, type PenPose } from './model';

// Pen Fight online: the messages, the shared rules and the quick-match stand-in.
//
// The host is side 0 (blue cap), the guest side 1 (red cap). Before play each side sends
// "pen" { pen } with the pen it picked. Then, for each flick (n counts flicks in game g):
//   "aim"   { g, n, t, dir, power }  a few times a second while the mover pulls back
//                                     (power −1 = not aiming), so the other side sees it;
//   "flick" { g, n, t, dir, power }  the flick itself;
//   "state" { g, n, pens }           once the mover's own physics settles: both pens
//                                     { x, y, a, out }. The other device animates the flick
//                                     with its own physics, then adopts this snapshot, so a
//                                     floating-point difference between phones never matters.
// Points and turns follow from the snapshot's "out" flags by the same rule on both sides.
// Start positions come from the shared seed, so both devices lay the same pens.
// Rematch: "rematch" from both, then game g + 1; the side that starts swaps.

export interface PFSettings { target: number }
export interface PenSnap { x: number; y: number; a: number; out: boolean }
export interface FlickMsg { g: number; n: number; t: number; dir: number; power: number }
export type AimMsg = FlickMsg;
export interface StateMsg { g: number; n: number; pens: PenSnap[] }
export interface PenMsg { pen: PenId }

export const QUICK: PFSettings = { target: 3 };
export const FLICK_SECONDS = 15;
export const PICK_SECONDS = 15;

/** Each game of a match (rematches) gets its own start positions from the room's seed. */
export const gameSeed = (seed: number, g: number) => (seed ^ Math.imul(g, 0x9e3779b1)) >>> 0;
/** Side 0 starts game 1; the starter swaps every game (and every round within it). */
export const gameStarter = (g: number) => ((g - 1) % 2) as 0 | 1;

/** The round rules, the same on every device (and in the stand-in). */
export class PFCore {
  scores: [number, number] = [0, 0];
  turn: number;
  starter: number;
  round = 1;
  seq = 0;
  over = false;
  private rng: Rng;
  constructor(public target: number, seed: number, public g: number) {
    this.rng = createRng(gameSeed(seed, g));
    this.starter = gameStarter(g);
    this.turn = this.starter;
  }
  /** Start positions for the next round (call once per round, in order). */
  poses(): PenPose[] { return startPoses(this.rng); }
  /** A flick by `turn` settled with these pens out. */
  settle(out: boolean[]): { winner: number | null; selfOut: boolean } {
    const me = this.turn, op = 1 - me;
    this.seq++;
    let winner: number | null = null;
    let selfOut = false;
    if (out[me]) { winner = op; selfOut = true; } else if (out[op]) winner = me;
    if (winner === null) { this.turn = op; return { winner, selfOut }; }
    this.scores[winner]++;
    if (this.scores[winner] >= this.target) this.over = true;
    else { this.starter = 1 - this.starter; this.round++; this.turn = this.starter; }
    return { winner, selfOut };
  }
}

/** Run a flick the way the screen does (real-time steps), returning the end and how long it took. */
export function playOut(w: PenWorld, who: number, f: Flick): number {
  w.flick(who, f);
  let t = 0;
  while (t < 7) {
    w.step();
    t += STEP;
    if (t > 0.25 && w.settled()) break;
  }
  for (const p of w.pens) if (!p.out) { p.vx = 0; p.vy = 0; p.w = 0; }
  return t;
}

export const snapOf = (w: PenWorld): PenSnap[] => w.pens.map((p) => ({ x: p.x, y: p.y, a: p.a, out: p.out }));

export function adopt(w: PenWorld, pens: PenSnap[]) {
  pens.forEach((s, i) => { const p = w.pens[i]; if (!p) return; p.x = s.x; p.y = s.y; p.a = s.a; p.out = s.out; p.vx = 0; p.vy = 0; p.w = 0; });
}

// ---------- The stand-in ----------

/**
 * Plays side 0 like a person: picks a pen, thinks, is seen pulling back (aim messages),
 * flicks, and sends the settled pens when its flick has had time to play out on screen.
 */
export function penBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: PFSettings; seed: number }) => {
    const rng = ctx.rng;
    const level = rng.chance(0.7) ? 'medium' : 'easy';
    const myPen: PenId = rng.chance(0.5) ? 'gel' : 'classic';
    let theirPen: PenId | null = null;
    let g = 1;
    let core: PFCore | null = null;
    let world: PenWorld | null = null;
    let wantRematch = false;
    let planned = '';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let alive = true;
    const later = (ms: number, f: () => void) => {
      const id = setTimeout(() => { timers.delete(id); if (alive) f(); }, ms);
      timers.add(id);
    };

    const newRound = (wait: number) => {
      if (!core || !theirPen) return;
      world = new PenWorld([PENS[myPen], PENS[theirPen]], core.poses());
      later(wait, think);
    };
    const startGame = () => {
      core = new PFCore(ctx.settings.target, ctx.seed, g);
      newRound(900 / speed);
    };

    const think = () => {
      if (!core || !world || core.over || core.turn !== 0) return;
      const c = core, n = c.seq, gg = g;
      // One plan per flick, however many timers ask for it.
      if (planned === `${gg}|${n}`) return;
      planned = `${gg}|${n}`;
      const ai = new PenAI(0, level, rng);
      ai.start(world);
      const t0 = Date.now();
      const work = () => {
        if (core !== c || c.seq !== n) return;
        const f = ai.work(10);
        if (!f) { later(0, work); return; }
        // Look at the desk for a moment, then pull back slowly where they can see it.
        const rest = Math.max(0, thinkMs(rng, 0.8, 2.6, speed) - (Date.now() - t0));
        later(rest, () => pullBack(gg, n, f));
      };
      work();
    };

    const pullBack = (gg: number, n: number, f: Flick) => {
      const steps = 6;
      const k0 = 0.15 + rng.next() * 0.1;
      for (let i = 1; i <= steps; i++) {
        later((i * 150) / speed, () => {
          if (g !== gg || core?.seq !== n) return;
          const k = Math.min(1, k0 + (i / steps) * (1 - k0));
          end.send('aim', { g: gg, n, t: f.t, dir: f.dir + (1 - k) * 0.05, power: f.power * k });
        });
      }
      later(((steps + 1) * 150 + 120) / speed, () => {
        if (g !== gg || !core || !world || core.seq !== n) return;
        end.send('flick', { g: gg, n, t: f.t, dir: f.dir, power: f.power });
        const secs = playOut(world, 0, f);
        const fell = world.pens.some((p) => p.out);
        later((secs * 1000 + 60) / speed, () => {
          if (g !== gg || !core || !world) return;
          end.send('state', { g: gg, n, pens: snapOf(world) });
          afterFlick(world.pens.map((p) => p.out), fell);
        });
      });
    };

    const afterFlick = (out: boolean[], fell: boolean) => {
      if (!core) return;
      const r = core.settle(out);
      if (core.over) return;
      // A point: the screen shows it for 2 s, then the next round.
      if (r.winner !== null) newRound((2000 + (fell ? 500 : 0)) / speed + 700 / speed);
      else later(400 / speed, think);
    };

    const offs = [
      end.on('pen', (d: PenMsg) => {
        if (theirPen || !d || (d.pen !== 'classic' && d.pen !== 'gel')) return;
        theirPen = d.pen;
        if (penSent) startGame();
      }),
      // Their flicks ("flick") need nothing here: their device is in charge, so wait for its snapshot.
      end.on('state', (d: StateMsg) => {
        if (!core || !world || d.g !== g || d.n !== core.seq || core.turn !== 1) return;
        adopt(world, d.pens);
        afterFlick(d.pens.map((p) => p.out), d.pens.some((p) => p.out));
      }),
      end.on('rematch', () => {
        if (wantRematch) return;
        wantRematch = true;
        later(thinkMs(rng, 1, 2.4, speed), () => {
          end.send('rematch');
          g += 1;
          wantRematch = false;
          startGame();
        });
      }),
    ];
    // Choosing a pen takes a moment too.
    let penSent = false;
    later(thinkMs(rng, 1.2, 3.5, speed), () => { end.send('pen', { pen: myPen }); penSent = true; if (theirPen) startGame(); });
    return () => { alive = false; offs.forEach((f) => f()); timers.forEach((t) => clearTimeout(t)); timers.clear(); };
  };
}

export function makePenBot(me: Profile, settings: PFSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: penBrain(speed), speed });
}
