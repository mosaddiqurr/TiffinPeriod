import { describe, expect, it } from 'vitest';
import { botPipe, type BotEnd } from '../src/platform/net/bot';
import { createRng } from '../src/engine/rng';
import { PKDuel, decodeDive, decodeShot, encodeDive, encodeShot, judgeKick, type KickEvent, type PKSetup } from '../src/games/penalty/duel';
import { makePenaltyBot } from '../src/games/penalty/bot';
import { decided, goals } from '../src/games/penalty/model';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(3); } };

function pair(setup: PKSetup, seed: number) {
  const [a, b] = botPipe(createRng(seed), 50);
  return { a: new PKDuel(a, 0, setup, seed), b: new PKDuel(b, 1, setup, seed) };
}

/** Each side locks its choice whenever it has to. */
function autoPlay(d: PKDuel, seed: number) {
  const rng = createRng(seed);
  const tick = () => {
    const v = d.view;
    if (v.phase !== 'pick' || v.myLocked) return;
    if (d.role === 'shoot') d.lockShot({ x: rng.range(-1.1, 1.1), y: rng.range(0.05, 1.1), power: rng.range(0.4, 1) });
    else d.lockDive({ x: rng.range(-1, 1), y: rng.range(0, 1) });
  };
  d.onChange(() => setTimeout(tick, 1));
  tick();
}

describe('Penalty online: values', () => {
  it('encodes in whole thousandths and refuses junk', () => {
    expect(decodeShot(encodeShot({ x: 0.12345, y: 0.5, power: 0.7 }))).toEqual({ x: 0.123, y: 0.5, power: 0.7 });
    expect(decodeDive(encodeDive({ x: -2, y: 0.25 }))).toEqual({ x: -1, y: 0.25 });
    expect(decodeShot('d:1,2')).toBeNull();
    expect(decodeShot('s:1,2,9999')).toBeNull();
    expect(decodeDive('d:1.5,2')).toBeNull();
    // A dive on the ball saves a soft central shot; the other way it goes in.
    expect(judgeKick({ x: 0.5, y: 0.3, power: 0.6 }, { x: 0.5, y: 0.3 })).toBe('saved');
    expect(judgeKick({ x: 0.7, y: 0.3, power: 0.6 }, { x: -0.7, y: 0.3 })).toBe('goal');
  });
});

describe('Penalty online: two devices', () => {
  it('plays a whole shootout; both sides see the same kicks and the same winner', async () => {
    const { a, b } = pair({ kicks: 5 }, 7);
    const evA: KickEvent[] = [], evB: KickEvent[] = [];
    a.onEvent((e) => evA.push(e)); b.onEvent((e) => evB.push(e));
    autoPlay(a, 1); autoPlay(b, 2);
    await until(() => a.view.phase === 'over' && b.view.phase === 'over' && evA.length === evB.length);
    expect(a.view.so).toEqual(b.view.so);
    expect(a.view.winner).toBe(b.view.winner);
    expect(a.view.winner).toBe(decided(a.view.so));
    expect(evA.map((e) => e.outcome)).toEqual(evB.map((e) => e.outcome));
    expect(evA.map((e) => e.shot)).toEqual(evB.map((e) => e.shot));
    // Kicks alternate, starting with the seed's side (7 % 2 = 1).
    expect(evA[0].kicker).toBe(1);
    evA.forEach((e, i) => expect(e.kicker).toBe(i % 2 === 0 ? 1 : 0));
    const g = goals(a.view.so);
    expect(g[0]).not.toBe(g[1]);
  });

  it('keeps 3 kicks each when the host picks 3', async () => {
    const { a, b } = pair({ kicks: 3 }, 4);
    expect(a.view.so.best).toBe(3);
    autoPlay(a, 3); autoPlay(b, 4);
    await until(() => a.view.phase === 'over' && b.view.phase === 'over');
    expect(a.view.so).toEqual(b.view.so);
    const n = a.view.so.kicks[0].length;
    if (n < 3) expect(decided({ ...a.view.so })).not.toBeNull();
  });

  it('never reveals before the other fingerprint is in', async () => {
    const sent: Array<{ type: string; data: any }> = [];
    const handlers = new Map<string, (d: any) => void>();
    const link: BotEnd = { send: (type, data) => sent.push({ type, data }), on: (type, cb) => { handlers.set(type, cb); return () => handlers.delete(type); } };
    const d = new PKDuel(link, 0, { kicks: 5 }, 0); // side 0 shoots first
    expect(d.role).toBe('shoot');
    d.lockShot({ x: 0.6, y: 0.6, power: 0.7 });
    await wait(20);
    expect(sent.map((s) => s.type)).toEqual(['commit']);
    expect(d.view.myLocked).toBe(true);
    handlers.get('commit')!({ g: 1, step: 1, h: 'abc' });
    expect(sent.map((s) => s.type)).toEqual(['commit', 'reveal']);
    expect(sent[1].data.v).toBe('s:600,600,700');
  });

  it('stops the match when a revealed choice does not match its fingerprint', async () => {
    const [ea, eb] = botPipe(createRng(1), 50);
    const a = new PKDuel(ea, 0, { kicks: 5 }, 0);
    // A cheating keeper: fingerprints one dive, then reveals another.
    let stepSeen = 0;
    eb.on('commit', (m: { step: number }) => { stepSeen = m.step; });
    a.lockShot({ x: 0.7, y: 0.7, power: 0.7 });
    await until(() => stepSeen === 1);
    eb.send('commit', { g: 1, step: 1, h: 'not-the-real-hash' });
    eb.send('reveal', { g: 1, step: 1, v: 'd:700,700', salt: 'x' });
    await until(() => a.view.cheat);
    expect(a.view.so.kicks[0].length).toBe(0);
  });

  it('the keeper adopts the shooter’s verdict', async () => {
    const [ea, eb] = botPipe(createRng(2), 50);
    const a = new PKDuel(ea, 1, { kicks: 5 }, 0); // side 0 (the other end) shoots first; a keeps
    const b = new PKDuel(eb, 0, { kicks: 5 }, 0);
    b.lockShot({ x: 0.8, y: 0.3, power: 0.7 });
    a.lockDive({ x: -0.8, y: 0.3 });
    await until(() => a.view.step === 2 && b.view.step === 2);
    expect(a.view.so.kicks[0]).toEqual([true]);
    // Pretend the shooter's phone judged it differently: its "res" wins.
    eb.send('res', { g: 1, step: 1, o: 'saved' });
    await until(() => a.view.so.kicks[0][0] === false);
    expect(a.view.so.kicks[0]).toEqual([false]);
  });

  it('rematch: both ask, a new shootout starts and the other side kicks first', async () => {
    const { a, b } = pair({ kicks: 3 }, 10);
    autoPlay(a, 5); autoPlay(b, 6);
    await until(() => a.view.phase === 'over' && b.view.phase === 'over');
    const first = a.view.so.first;
    a.askRematch();
    await wait(30);
    expect(b.view.rematch.them).toBe(true);
    b.askRematch();
    await until(() => a.view.game === 2 && b.view.game === 2);
    expect(a.view.so.first).toBe(first === 0 ? 1 : 0);
    expect(b.view.so.first).toBe(a.view.so.first);
    await until(() => a.view.phase === 'over' && b.view.phase === 'over');
    expect(a.view.so).toEqual(b.view.so);
  });
});

describe('Penalty online: the stand-in', () => {
  it('sends the settings, plays a whole shootout as a real host would, and answers a rematch', async () => {
    const peer = makePenaltyBot({ name: 'Me', team: 'ban' }, 12345, 80);
    const cfg = await new Promise<{ settings: PKSetup; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg.settings.kicks).toBe(5);
    expect(peer.them.name).not.toMatch(/bot|computer/i);
    expect(peer.them.team).toBeTruthy();
    const me = new PKDuel(peer, 1, cfg.settings, cfg.seed);
    const ev: KickEvent[] = [];
    me.onEvent((e) => ev.push(e));
    autoPlay(me, 77);
    await until(() => me.view.phase === 'over', 20000);
    expect(me.view.cheat).toBe(false);
    expect(ev.length).toBeGreaterThanOrEqual(6);
    expect(me.view.winner).toBe(decided(me.view.so));
    me.askRematch();
    await until(() => me.view.game === 2, 10000);
    await until(() => me.view.so.kicks[0].length + me.view.so.kicks[1].length >= 2, 10000);
    peer.close();
  }, 40000);
});
