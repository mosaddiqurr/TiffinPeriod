import { createRng, type Rng } from '../../engine/rng';
import { ballsLeft } from '../../shared/cricket';
import { teamsFor } from '../../shared/teams';
import type { Peer, Profile } from '../../platform/net/rooms';
import { HandAI } from './ai';
import { HCDuel, type DuelLink, type DuelSetup, type DuelView } from './duel';
import { battingSide, limitsOf, targetOf } from './logic';

// The stand-in for quick match when nobody else is waiting. It plays through the same
// HCDuel protocol as a real player on the other end of a pretend connection: small network
// delays, thinking time that varies, a name and a team. It uses the computer opponent's
// brain at a medium level, mixed with some randomness, like an ordinary player.

const NAMES = ['Rafi', 'Tanvir', 'Nusrat', 'Sakib', 'Mim', 'Arif', 'Sumaiya', 'Rakib', 'Faria', 'Shuvo', 'Tamim', 'Jannat', 'Imran', 'Riya', 'Nayeem', 'Sadia', 'Hasib', 'Tasnim', 'Mahin', 'Anika', 'Fahim', 'Labiba', 'Zarif', 'Orpa'];
const TAGS = ['', '', '', '07', '_bd', '10', '99', '_ctg', '_dhk', '22', 'x'];
const FAV = ['ban', 'ban', 'ban', 'ind', 'pak', 'aus', 'eng', 'sl', 'afg', 'nz', 'sa', 'wi'];

export const QUICK_SETUP: DuelSetup = { overs: 2, wickets: 2 };

export function botProfile(rng: Rng): Profile {
  const name = rng.pick(NAMES) + rng.pick(TAGS);
  const ids = new Set(teamsFor('cricket').map((t) => t.id));
  const team = FAV.filter((f) => ids.has(f));
  return { name, team: rng.pick(team.length ? team : [...ids]) };
}

/** A pair of in-memory endpoints with a little delay each way. */
function pipe(rng: Rng, speed = 1): [DuelLink & { gone: Set<() => void> }, DuelLink & { gone: Set<() => void> }] {
  type H = Map<string, Set<(d: any) => void>>;
  const ha: H = new Map(), hb: H = new Map();
  // Messages nobody listens for yet are held, like a real connection's inbox.
  const held = new Map<H, Map<string, unknown[]>>([[ha, new Map()], [hb, new Map()]]);
  const mk = (mine: H, theirs: H) => {
    // Like a real connection: a little delay, but always in order.
    let last = 0;
    return {
    gone: new Set<() => void>(),
    send: (type: string, data?: unknown) => {
      const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
      const at = Math.max(Date.now() + (45 + rng.next() * 110) / speed, last + 1);
      last = at;
      setTimeout(() => {
        const hs = theirs.get(type);
        if (hs && hs.size) hs.forEach((cb) => cb(copy));
        else { const q = held.get(theirs)!; if (!q.has(type)) q.set(type, []); q.get(type)!.push(copy); }
      }, at - Date.now());
    },
    on: (type: string, cb: (d: any) => void) => {
      if (!mine.has(type)) mine.set(type, new Set());
      mine.get(type)!.add(cb);
      const q = held.get(mine)!.get(type);
      if (q) { held.get(mine)!.delete(type); queueMicrotask(() => q.forEach((d) => cb(d))); }
      return () => mine.get(type)?.delete(cb);
    },
    };
  };
  return [mk(ha, hb), mk(hb, ha)];
}

/** The opponent seen by the player: a Peer whose other end is played by the computer. */
/** `speed` > 1 makes it think faster (tests only). */
export function makeHandCricketBot(me: Profile, seed = (Math.random() * 2 ** 31) >>> 0, speed = 1): Peer {
  const rng = createRng(seed);
  const them = botProfile(rng);
  const [human, botEnd] = pipe(rng, speed);
  // The stand-in waited longer, so it is the host (side 0) and sets the match up.
  const duel = new HCDuel(botEnd, 0, QUICK_SETUP);
  const ai = new HandAI(rng.chance(0.6) ? 'medium' : 'easy', rng);
  const pace = 0.7 + rng.next() * 0.8; // some players are quicker than others
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSeen = '';
  let closed = false;
  const think = (min: number, max: number) => ((min + rng.next() * (max - min)) * pace * 1000 * (rng.chance(0.08) ? 2 : 1)) / speed;

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
      // A new innings or the first ball takes a little longer to start.
      const slow = inn.balls === 0 ? 1.2 : 0;
      timer = setTimeout(() => void duel.pick(n), think(0.9 + slow, 2.8 + slow));
    } else if (v.phase === 'over' && v.rematch.them && !v.rematch.me) {
      timer = setTimeout(() => duel.askRematch(), think(1, 2.5));
    }
  };
  duel.onChange(act);
  duel.onEvent((e) => { if (e.kind === 'ball') { const bat = battingSide(e.before); ai.observe(bat === 1 ? 'bat' : 'bowl', e.picks[1]); } });
  act(duel.view);

  return {
    host: false, me, them, code: '',
    send: (type, data) => human.send(type, data),
    on: (type, cb) => human.on(type, cb),
    onGone: (cb) => { human.gone.add(cb); return () => human.gone.delete(cb); },
    close: () => { closed = true; clearTimeout(timer); duel.dispose(); },
  };
}
