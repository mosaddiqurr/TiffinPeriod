import { describe, expect, it } from 'vitest';
import { FlikkScene, type Control, type FlikkEnd, type FlikkHud, type NetFlick, type NetSnap } from '../src/games/flikk-football/scene';
import { ONLINE_FLICKS, makeFlikkBot, onlineConfig, runHeadless, type FFSettings } from '../src/games/flikk-football/online';
import type { TeamSetup } from '../src/games/flikk-football/match';
import type { Side } from '../src/games/flikk-football/physics';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SPEED = 40;
const A_SETUP: TeamSetup = { formation: '4-3-3', mentality: 'balanced' };
const B_SETUP: TeamSetup = { formation: '4-4-2', mentality: 'attack' };

type Sent = { type: 'flick' | 'snap'; data: NetFlick | NetSnap };

/** One device: a scene playing `me` by "hand" (autoFlick), the other side remote. */
function device(me: Side, settings: FFSettings, teams: [string, string], setups: [TeamSetup, TeamSetup], out: (s: Sent) => void, g = 1) {
  const st: { hud: FlikkHud | null; end: FlikkEnd | null; sent: Sent[] } = { hud: null, end: null, sent: [] };
  const control: [Control, Control] = me === 0 ? ['human', 'remote'] : ['remote', 'human'];
  const scene = new FlikkScene(onlineConfig({
    settings, teams, setups, g, seed: 77, control, silent: true, flip: me === 1,
    send: (type, data) => { const s = { type, data: JSON.parse(JSON.stringify(data)) }; st.sent.push(s); out(s); },
  }), () => '', (h) => { st.hud = h; }, (e) => { st.end = e; });
  const stop = runHeadless(scene, SPEED);
  const hand = setInterval(() => { if (st.hud && st.hud.phase === 'aim' && st.hud.control === 'human') scene.autoFlick(0.5); }, 5);
  return { scene, st, stop: () => { stop(); clearInterval(hand); } };
}

/** Delivers to a scene after a little delay, in order. */
function link(target: () => FlikkScene) {
  let last = 0;
  return (s: Sent) => {
    const at = Math.max(Date.now() + 2 + Math.random() * 4, last + 1);
    last = at;
    setTimeout(() => { const sc = target(); if (s.type === 'flick') sc.remoteFlick(s.data as NetFlick); else sc.remoteSnap(s.data as NetSnap); }, at - Date.now());
  };
}

describe('Flikk Football online: two devices', () => {
  it('play the same match: every flick and result goes across, and both end with the same score', async () => {
    const teams: [string, string] = ['ban', 'arg'];
    const setups: [TeamSetup, TeamSetup] = [A_SETUP, B_SETUP];
    let a!: ReturnType<typeof device>, b!: ReturnType<typeof device>;
    a = device(0, { len: 'short' }, teams, setups, link(() => b.scene));
    b = device(1, { len: 'short' }, teams, setups, link(() => a.scene));
    for (let i = 0; i < 3000 && !(a.st.end && b.st.end); i++) await wait(10);
    a.stop(); b.stop();
    expect(a.st.end).not.toBeNull();
    expect(b.st.end).not.toBeNull();
    expect(b.st.end!.score).toEqual(a.st.end!.score);
    expect(b.st.end!.winner).toBe(a.st.end!.winner);
    expect(b.st.end!.stats.passes).toEqual(a.st.end!.stats.passes);
    // Both sides flicked, every flick has its result, and the clock ran out exactly.
    const flicks = [...a.st.sent, ...b.st.sent].filter((s) => s.type === 'flick');
    const snaps = [...a.st.sent, ...b.st.sent].filter((s) => s.type === 'snap');
    expect(a.st.sent.some((s) => s.type === 'flick') && b.st.sent.some((s) => s.type === 'flick')).toBe(true);
    expect(snaps.length).toBe(flicks.length);
    expect(flicks.length).toBeGreaterThan(15);
    expect(new Set(flicks.map((f) => f.data.seq)).size).toBe(flicks.length);
    // Only the side on the ball sends: a's flicks are side 0's turns (snap results name holders).
    for (const s of snaps) { const d = s.data as NetSnap; expect(d.res.goal === null ? d.res.holder >= 0 : true).toBe(true); }
    expect(a.st.hud!.over && b.st.hud!.over).toBe(true);
    expect(a.st.hud!.left).toBe(0);
    expect(b.st.hud!.left).toBe(0);
  }, 90000);

  it('ignores a flick out of turn or already played', () => {
    const scene = new FlikkScene(onlineConfig({ settings: { len: 'short' }, teams: ['ban', 'bra'], setups: [A_SETUP, B_SETUP], g: 1, seed: 1, control: ['human', 'remote'], silent: true, send: () => {} }), () => '', () => {}, () => {});
    // Side 0 (human) kicks off: a remote flick waits and is not played while it's our turn.
    scene.update(1); // past the kick-off whistle
    const before = scene.w.bodies.find((b) => b.kind === 'ball')!;
    const y0 = before.y;
    scene.remoteFlick({ seq: 0, holder: 0, ball: [300, 480], keepers: [[300, 876], [300, 84]], angle: Math.PI / 2, power: 1, spin: 0 });
    for (let i = 0; i < 30; i++) scene.update(1 / 60);
    expect(scene.w.bodies.find((b) => b.kind === 'ball')!.y).toBeCloseTo(y0, 5);
    expect(scene.autoFlick(0.5)).toBe(true);
    // Now seq 0 has been played here: the queued one and a repeat are dropped.
    scene.remoteFlick({ seq: 0, holder: 0, ball: [300, 480], keepers: [[300, 876], [300, 84]], angle: 0, power: 1, spin: 0 });
    expect((scene as unknown as { inbox: NetFlick[] }).inbox.length).toBe(0);
  });

  it('match lengths are the fixed style clock', () => {
    expect(ONLINE_FLICKS.short).toBe(30);
    expect(ONLINE_FLICKS.normal).toBe(45);
  });
});

describe('Flikk Football online: the stand-in', () => {
  it('sends the settings and its formation, plays a whole match as side 0, and answers a rematch', async () => {
    const me = { name: 'Me', team: 'ban' };
    const peer = makeFlikkBot(me, { len: 'short' }, 5, SPEED);
    const cfg = await new Promise<{ settings: FFSettings; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg.settings.len).toBe('short');
    expect(peer.them.name).not.toMatch(/bot|computer/i);
    const setups: Record<number, TeamSetup> = {};
    peer.on('setup', (d: { g: number; setup: TeamSetup }) => { setups[d.g] = d.setup; });
    peer.send('setup', { g: 1, setup: B_SETUP });
    for (let i = 0; i < 200 && !setups[1]; i++) await wait(5);
    expect(setups[1]).toBeTruthy();
    let dev!: ReturnType<typeof device>;
    const held: Array<{ type: 'flick' | 'snap'; d: NetFlick | NetSnap }> = [];
    const give = (type: 'flick' | 'snap', d: NetFlick | NetSnap & { g: number }) => { if (!dev) { held.push({ type, d }); return; } if (type === 'flick') dev.scene.remoteFlick(d as NetFlick); else dev.scene.remoteSnap(d as NetSnap); };
    peer.on('flick', (d: NetFlick & { g: number }) => { if (d.g === 1) give('flick', d); });
    peer.on('snap', (d: NetSnap & { g: number }) => { if (d.g === 1) give('snap', d); });
    dev = device(1, cfg.settings, [peer.them.team, me.team], [setups[1], B_SETUP], (s) => peer.send(s.type, { ...s.data, g: 1 }));
    held.splice(0).forEach((h) => give(h.type, h.d as NetFlick & NetSnap & { g: number }));
    for (let i = 0; i < 6000 && !dev.st.end; i++) await wait(10);
    dev.stop();
    expect(dev.st.end).not.toBeNull();
    expect(dev.st.hud!.left).toBe(0);
    // It took its turns.
    expect(dev.st.end!.stats.shots[0] + dev.st.end!.stats.passes[0] + dev.st.end!.stats.passes[1]).toBeGreaterThan(0);
    const answered = new Promise((r) => peer.on('rematch', r));
    peer.send('rematch');
    await answered;
    for (let i = 0; i < 400 && !setups[2]; i++) await wait(5);
    expect(setups[2]).toBeTruthy();
    peer.close();
  }, 120000);
});
