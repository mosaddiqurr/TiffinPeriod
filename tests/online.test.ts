import { describe, expect, it } from 'vitest';
import { CODE_CHARS, CODE_LEN, cleanCode, isCode, newCode, pairCode, pairUp } from '../src/platform/net/rooms';
import { HCDuel, type DuelLink } from '../src/games/hand-cricket/duel';
import { makeHandCricketBot, QUICK_SETUP } from '../src/games/hand-cricket/bot';
import { createRng } from '../src/engine/rng';

/** Two in-memory ends that deliver in order, after a tick. */
function wire(): [DuelLink & { log: string[]; tamper?: (t: string, d: any) => any }, DuelLink & { log: string[]; tamper?: (t: string, d: any) => any }] {
  type H = Map<string, Set<(d: any) => void>>;
  const ha: H = new Map(), hb: H = new Map();
  const mk = (mine: H, theirs: H) => {
    const end = {
      log: [] as string[],
      tamper: undefined as undefined | ((t: string, d: any) => any),
      send: (type: string, data?: unknown) => {
        end.log.push(type);
        const d = end.tamper ? end.tamper(type, JSON.parse(JSON.stringify(data ?? null))) : JSON.parse(JSON.stringify(data ?? null));
        queueMicrotask(() => theirs.get(type)?.forEach((cb) => cb(d)));
      },
      on: (type: string, cb: (d: any) => void) => { if (!mine.has(type)) mine.set(type, new Set()); mine.get(type)!.add(cb); return () => mine.get(type)?.delete(cb); },
    };
    return end;
  };
  return [mk(ha, hb), mk(hb, ha)];
}

const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('room codes and pairing', () => {
  it('codes use 5 easy-to-read characters, and typing is forgiving', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) { const c = newCode(() => rng.next()); expect(isCode(c)).toBe(true); expect(c).toHaveLength(CODE_LEN); }
    expect(CODE_CHARS).not.toMatch(/[01OIL]/);
    expect(cleanCode(' ab7 k3q ')).toBe('AB7K3');
    expect(cleanCode('a-b-c')).toBe('ABC');
  });
  it('quick match pairs the two who waited longest; both devices get the same room', () => {
    const ms = [{ id: 'x', joinedAt: 5 }, { id: 'y', joinedAt: 9 }, { id: 'z', joinedAt: 12 }];
    expect(pairUp(ms, 'x')).toEqual({ partner: 'y', host: true });
    expect(pairUp(ms, 'y')).toEqual({ partner: 'x', host: false });
    expect(pairUp(ms, 'z')).toBeNull();
    expect(pairCode('x', 'y')).toBe(pairCode('y', 'x'));
    expect(isCode(pairCode('socket-a', 'socket-b'))).toBe(true);
  });
});

describe('online Hand Cricket (two devices)', () => {
  it('toss, choice and a whole match: both devices see exactly the same game', async () => {
    const [a, b] = wire();
    const host = new HCDuel(a, 0, { overs: 1, wickets: 2 });
    const guest = new HCDuel(b, 1);
    await settle();
    expect(guest.view.setup).toEqual({ overs: 1, wickets: 2 });
    expect(guest.view.phase).toBe('call');
    guest.callToss('even');
    await settle();
    expect(host.view.phase).toBe('tossPick');
    await host.pick(3); await guest.pick(5);
    await settle();
    expect(host.view.tossNums).toEqual([3, 5]);
    expect(guest.view.tossWin).toBe(1); // 3 + 5 = 8, even: the guest called it
    guest.choose(true);
    await settle();
    expect(host.view.phase).toBe('play');
    const rng = createRng(7);
    for (let i = 0; i < 40 && host.view.phase === 'play'; i++) {
      await host.pick(rng.int(1, 6)); await guest.pick(rng.int(1, 6));
      await settle();
    }
    expect(host.view.phase).toBe('over');
    expect(guest.view.phase).toBe('over');
    expect(host.view.match!.innings).toEqual(guest.view.match!.innings);
    expect(host.view.match!.result).toEqual(guest.view.match!.result);
    expect(host.view.match!.battingFirst).toBe(1);
  });
  it('nobody sees the other number before both are locked, and a changed number is caught', async () => {
    const [a, b] = wire();
    const host = new HCDuel(a, 0, { overs: 1, wickets: 1 });
    const guest = new HCDuel(b, 1);
    await settle();
    guest.callToss('odd'); await settle();
    await host.pick(2); await settle();
    expect(a.log).toContain('commit');
    expect(a.log).not.toContain('reveal');
    expect(guest.view.theirLocked).toBe(true);
    // The guest tries to send a different number from the one it locked.
    b.tamper = (t, d) => (t === 'reveal' ? { ...d, n: d.n === 6 ? 5 : 6 } : d);
    await guest.pick(4); await settle();
    expect(host.view.cheat).toBe(true);
    expect(host.view.phase).toBe('tossPick');
  });
  it('rematch: both agree, the toss caller swaps', async () => {
    const [a, b] = wire();
    const host = new HCDuel(a, 0, { overs: 1, wickets: 1 });
    const guest = new HCDuel(b, 1);
    await settle();
    guest.callToss('odd'); await settle();
    await host.pick(1); await guest.pick(2); await settle();
    const w = host.view.tossWin!;
    (w === 0 ? host : guest).choose(true); await settle();
    for (let i = 0; i < 30 && host.view.phase === 'play'; i++) { await host.pick(3); await guest.pick(3); await settle(); }
    expect(host.view.phase).toBe('over');
    host.askRematch(); await settle();
    expect(guest.view.rematch.them).toBe(true);
    guest.askRematch(); await settle();
    expect(host.view.phase).toBe('call');
    expect(host.view.game).toBe(2);
    expect(host.view.caller).toBe(0);
  });
});

describe('quick match stand-in', () => {
  it('plays a full match through the same protocol, with human-like delays', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    {
      const peer = makeHandCricketBot({ name: 'Me', team: 'ban' }, 42, 50);
      expect(peer.them.name.length).toBeGreaterThan(2);
      const me = new HCDuel(peer, 1);
      await wait(40);
      expect(me.view.setup).toEqual(QUICK_SETUP);
      me.callToss('odd');
      await me.pick(4);
      for (let i = 0; i < 200 && me.view.phase !== 'over'; i++) {
        await wait(40);
        const v = me.view;
        if (v.phase === 'choose' && v.tossWin === 1) me.choose(false);
        if (v.phase === 'play' && v.myPick === null) await me.pick(((i * 5) % 6) + 1);
      }
      expect(me.view.phase).toBe('over');
      expect(me.view.match!.result).not.toBeNull();
      peer.close();
    }
  }, 30000);
});
