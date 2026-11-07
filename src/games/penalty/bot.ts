import type { Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { KeeperAI, aiKick } from './model';
import { PKDuel, type PKSetup, type PKView } from './duel';

// The quick-match stand-in for Penalty Shootout: plays the host's side (side 0) of PKDuel through
// the shared pretend connection, with the game's own computer kicker (aiKick) and the computer
// keeper's guess (it never sees the shot: the dive is locked in secret, like a person's).

export const QUICK_SETUP: PKSetup = { kicks: 5 };
/** About how long one kick takes to play on screen; the stand-in watches it too. */
const WATCH_S = 3;

export function penaltyBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: PKSetup; seed: number }) => {
    const rng = ctx.rng;
    const duel = new PKDuel(end, 0, ctx.settings, ctx.seed);
    const skill = rng.range(0.35, 0.7);
    const keeper = new KeeperAI(skill, rng);
    const pace = 0.75 + rng.next() * 0.7;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSeen = '';
    let closed = false;
    const think = (min: number, max: number) => thinkMs(rng, min * pace, max * pace, speed);
    const act = (v: PKView) => {
      const key = `${v.game}|${v.phase}|${v.step}|${v.myLocked}|${v.rematch.them}|${v.cheat}`;
      if (key === lastSeen || closed) return;
      lastSeen = key;
      clearTimeout(timer);
      if (v.cheat) return;
      if (v.phase === 'pick' && !v.myLocked) {
        const watch = v.step === 1 ? 0.6 : WATCH_S;
        if (duel.role === 'shoot') {
          const n = v.so.kicks[0].length;
          const pressure = n >= v.so.best ? 1 : n >= v.so.best - 2 ? 0.5 : 0.2;
          timer = setTimeout(() => duel.lockShot(aiKick(skill, rng, pressure).shot), think(watch + 1.4, watch + 4.2));
        } else {
          timer = setTimeout(() => duel.lockDive(keeper.guess()), think(watch + 1, watch + 3.6));
        }
      } else if (v.phase === 'over' && v.rematch.them && !v.rematch.me) {
        timer = setTimeout(() => duel.askRematch(), think(1, 2.5));
      }
    };
    duel.onChange(act);
    // It learns the player's favourite side, as the offline keeper does.
    duel.onEvent((e) => { if (e.kicker === 1) keeper.observe(e.shot.x); });
    act(duel.view);
    return () => { closed = true; clearTimeout(timer); duel.dispose(); };
  };
}

/** `speed` > 1 makes it think faster (tests only). */
export function makePenaltyBot(me: Profile, seed = (Math.random() * 2 ** 31) >>> 0, speed = 1, settings: PKSetup = QUICK_SETUP): Peer {
  return makeBotPeer(me, { settings, seed, sport: 'football', brain: penaltyBrain(speed), speed });
}
