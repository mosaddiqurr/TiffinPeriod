import { createRng, type Rng } from '../../engine/rng';
import { teamsFor } from '../../shared/teams';
import type { Peer, Profile } from './rooms';

// The quick-match stand-in, for any game. When nobody else is searching, the player gets
// a Peer whose other end is played by the computer through the same messages a real
// player would send: small network delays, always in order, held until the game listens.
//
// The stand-in is the "host": it sends the match settings first, exactly like a real host
// (message "cfg", see OnlineLobby). A game supplies the `brain`, which plays the other end.

const NAMES = ['Rafi', 'Tanvir', 'Nafis', 'Sakib', 'Mahir', 'Arif', 'Sabbir', 'Rakib', 'Farhan', 'Shuvo', 'Tamim', 'Jubayer', 'Imran', 'Rifat', 'Nayeem', 'Sajid', 'Hasib', 'Tahsin', 'Mahin', 'Ayan', 'Fahim', 'Labib', 'Zarif', 'Omi'];
const TAGS = ['', '', '', '07', '_bd', '10', '99', '_ctg', '_dhk', '22', 'x'];
const FAV: Record<'cricket' | 'football', string[]> = {
  cricket: ['ban', 'ban', 'ban', 'ind', 'pak', 'aus', 'eng', 'sl', 'afg', 'nz', 'sa', 'wi'],
  football: ['ban', 'ban', 'arg', 'arg', 'bra', 'bra', 'por', 'esp', 'ger', 'fra', 'eng', 'ned'],
};

export function botProfile(rng: Rng, sport: 'cricket' | 'football' = 'cricket'): Profile {
  const name = rng.pick(NAMES) + rng.pick(TAGS);
  const ids = new Set(teamsFor(sport).map((t) => t.id));
  const team = FAV[sport].filter((f) => ids.has(f));
  return { name, team: rng.pick(team.length ? team : [...ids]) };
}

/** One end of the pretend connection, as a game brain sees it. */
export interface BotEnd {
  send(type: string, data?: unknown): void;
  on(type: string, cb: (data: any) => void): () => void;
}

type H = Map<string, Set<(d: any) => void>>;

/** A pair of in-memory endpoints: a little delay each way, always in order, held until someone listens. */
export function botPipe(rng: Rng, speed = 1): [BotEnd, BotEnd] {
  const ha: H = new Map(), hb: H = new Map();
  const held = new Map<H, Map<string, unknown[]>>([[ha, new Map()], [hb, new Map()]]);
  const mk = (mine: H, theirs: H): BotEnd => {
    let last = 0;
    return {
      send: (type, data) => {
        const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
        const at = Math.max(Date.now() + (45 + rng.next() * 110) / speed, last + 1);
        last = at;
        setTimeout(() => {
          const hs = theirs.get(type);
          if (hs && hs.size) hs.forEach((cb) => cb(copy));
          else { const q = held.get(theirs)!; if (!q.has(type)) q.set(type, []); q.get(type)!.push(copy); }
        }, at - Date.now());
      },
      on: (type, cb) => {
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

export interface BotOptions<S> {
  settings: S;
  seed?: number;
  sport?: 'cricket' | 'football';
  /** Plays the stand-in's side. Gets the bot end of the pipe; returns a clean-up. */
  brain: (end: BotEnd, ctx: { rng: Rng; me: Profile; them: Profile; settings: S; seed: number }) => () => void;
  /** > 1 makes everything faster (tests only). */
  speed?: number;
}

/** The opponent seen by the player: a Peer whose other end is the computer. */
export function makeBotPeer<S>(me: Profile, o: BotOptions<S>): Peer {
  const seed = o.seed ?? ((Math.random() * 2 ** 31) >>> 0);
  const rng = createRng(seed ^ 0x2f6b);
  const them = botProfile(rng, o.sport);
  const [human, end] = botPipe(rng, o.speed ?? 1);
  // Like a real host: settings first.
  end.send('cfg', { settings: o.settings, seed });
  const stop = o.brain(end, { rng, me, them, settings: o.settings, seed });
  const gone = new Set<() => void>();
  return {
    host: false, me, them, code: '',
    send: (type, data) => human.send(type, data),
    on: (type, cb) => human.on(type, cb),
    onGone: (cb) => { gone.add(cb); return () => gone.delete(cb); },
    close: () => stop(),
  };
}

/** Think time in ms between `min` and `max` seconds, sometimes slower, scaled by `speed`. */
export function thinkMs(rng: Rng, min: number, max: number, speed = 1): number {
  return ((min + rng.next() * (max - min)) * 1000 * (rng.chance(0.08) ? 1.8 : 1)) / speed;
}
