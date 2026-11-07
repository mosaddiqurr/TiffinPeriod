import type { Rng } from '../../engine/rng';
import { ballsLeft } from '../../shared/cricket';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { HandAI } from './ai';
import { HCDuel, type DuelSetup, type DuelView } from './duel';
import { battingSide, limitsOf, targetOf } from './logic';

// The quick-match stand-in for Hand Cricket: plays the host's side of HCDuel through the
// shared pretend connection (platform/net/bot.ts), with the computer opponent's brain at an
// easy or medium level and varying thinking time.

export const QUICK_SETUP: DuelSetup = { overs: 2, wickets: 2 };

export function handCricketBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: DuelSetup }) => {
    const rng = ctx.rng;
    const duel = new HCDuel(end, 0, ctx.settings);
    const ai = new HandAI(rng.chance(0.6) ? 'medium' : 'easy', rng);
    const pace = 0.7 + rng.next() * 0.8;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSeen = '';
    let closed = false;
    const think = (min: number, max: number) => thinkMs(rng, min * pace, max * pace, speed);
    const act = (v: DuelView) => {
      const key = `${v.game}|${v.phase}|${v.step}|${v.myPick}|${v.call}|${v.rematch.them}`;
      if (key === lastSeen || closed) return;
      lastSeen = key;
      clearTimeout(timer);
      if (v.phase === 'call' && v.caller === 0) timer = setTimeout(() => duel.callToss(rng.chance(0.5) ? 'odd' : 'even'), think(0.8, 2));
      else if (v.phase === 'tossPick' && v.myPick === null) timer = setTimeout(() => void duel.pick(rng.int(1, 6)), think(0.7, 2.2));
      else if (v.phase === 'choose' && v.tossWin === 0) timer = setTimeout(() => duel.choose(ai.chooseBatFirst()), think(1, 2.4));
      else if (v.phase === 'play' && v.myPick === null && v.match) {
        const m = v.match;
        const bat = battingSide(m);
        const inn = m.innings[m.current];
        const tg = targetOf(m);
        const n = ai.choose(bat === 0 ? 'bat' : 'bowl', {
          need: tg !== undefined && bat === 0 ? tg - inn.runs : undefined,
          wicketsLeft: m.config.wickets - inn.wickets,
          ballsLeft: ballsLeft(inn, limitsOf(m.config)),
        });
        const slow = inn.balls === 0 ? 1.2 : 0;
        timer = setTimeout(() => void duel.pick(n), think(0.9 + slow, 2.8 + slow));
      } else if (v.phase === 'over' && v.rematch.them && !v.rematch.me) {
        timer = setTimeout(() => duel.askRematch(), think(1, 2.5));
      }
    };
    duel.onChange(act);
    duel.onEvent((e) => { if (e.kind === 'ball') { const bat = battingSide(e.before); ai.observe(bat === 1 ? 'bat' : 'bowl', e.picks[1]); } });
    act(duel.view);
    return () => { closed = true; clearTimeout(timer); duel.dispose(); };
  };
}

/** `speed` > 1 makes it think faster (tests only). */
export function makeHandCricketBot(me: Profile, seed = (Math.random() * 2 ** 31) >>> 0, speed = 1, settings: DuelSetup = QUICK_SETUP): Peer {
  return makeBotPeer(me, { settings, seed, sport: 'cricket', brain: handCricketBrain(speed), speed });
}
