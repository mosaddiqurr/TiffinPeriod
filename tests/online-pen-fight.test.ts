import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { PENS, PenAI, PenWorld, type PenId } from '../src/games/pen-fight/model';
import { PFCore, adopt, gameSeed, gameStarter, makePenBot, playOut, snapOf, type FlickMsg, type StateMsg } from '../src/games/pen-fight/duel';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Pen Fight online: rules', () => {
  it('both devices lay the same pens from the seed, and the starter swaps each game', () => {
    const a = new PFCore(3, 1234, 1), b = new PFCore(3, 1234, 1);
    expect(a.poses()).toEqual(b.poses());
    expect(a.poses()).toEqual(b.poses());
    expect(new PFCore(3, 1234, 2).poses()).not.toEqual(new PFCore(3, 1234, 1).poses());
    expect(gameStarter(1)).toBe(0);
    expect(gameStarter(2)).toBe(1);
    expect(gameSeed(5, 1)).not.toBe(gameSeed(5, 2));
  });

  it('a knocked-off pen scores for the mover, an own fall scores for the other side, first to the target wins', () => {
    const c = new PFCore(3, 9, 1);
    expect(c.turn).toBe(0);
    expect(c.settle([false, false])).toEqual({ winner: null, selfOut: false });
    expect(c.turn).toBe(1);
    expect(c.settle([false, true])).toEqual({ winner: 0, selfOut: true }); // side 1's own pen fell
    expect(c.scores).toEqual([1, 0]);
    expect(c.round).toBe(2);
    expect(c.turn).toBe(1); // the next round's starter
    c.settle([true, false]);
    expect(c.scores).toEqual([1, 1]);
    c.settle([false, true]); c.settle([false, true]);
    expect(c.over).toBe(true);
    expect(c.scores[0]).toBe(3);
    expect(c.seq).toBe(5);
  });

  it('the other device animates the flick with its own floats, then adopts the snapshot: both agree', () => {
    const poses = new PFCore(3, 77, 1).poses();
    const mover = new PenWorld([PENS.classic, PENS.gel], poses);
    const watcher = new PenWorld([PENS.classic, PENS.gel], poses);
    const f = { t: 0.1, dir: 0.05, power: 0.9 };
    playOut(mover, 0, f);
    // A phone that rounds a little differently.
    playOut(watcher, 0, { ...f, power: f.power * (1 + 1e-9) });
    const snap: StateMsg = JSON.parse(JSON.stringify({ g: 1, n: 0, pens: snapOf(mover) }));
    adopt(watcher, snap.pens);
    expect(snapOf(watcher)).toEqual(snapOf(mover));
  });
});

/** A whole player on the other device, without the 3D view: the same messages PenFightGame sends. */
function headlessPlayer(peer: ReturnType<typeof makePenBot>, myPen: PenId, rngSeed = 3) {
  const me = 1;
  const rng = createRng(rngSeed);
  const s = { cfg: null as null | { settings: { target: number }; seed: number }, theirPen: null as PenId | null, g: 1, core: null as PFCore | null, world: null as PenWorld | null, aims: 0, aimBeforeFlick: true, results: [] as Array<[number, number]>, flicksSeen: 0 };
  const start = () => {
    if (!s.cfg || !s.theirPen) return;
    s.core = new PFCore(s.cfg.settings.target, s.cfg.seed, s.g);
    s.world = new PenWorld([PENS[s.theirPen], PENS[myPen]], s.core.poses());
    turn();
  };
  const after = (out: boolean[]) => {
    const c = s.core!;
    const r = c.settle(out);
    if (c.over) { s.results.push([...c.scores] as [number, number]); return; }
    if (r.winner !== null) s.world = new PenWorld([PENS[s.theirPen!], PENS[myPen]], c.poses());
    turn();
  };
  const turn = () => {
    const c = s.core!;
    if (c.over || c.turn !== me) return;
    const n = c.seq, g = s.g;
    setTimeout(() => {
      if (s.core !== c || c.seq !== n) return;
      const ai = new PenAI(me, 'easy', rng);
      ai.start(s.world!);
      let f = null;
      while (!(f = ai.work(50)));
      peer.send('flick', { g, n, ...f });
      playOut(s.world!, me, f);
      peer.send('state', { g, n, pens: snapOf(s.world!) });
      after(s.world!.pens.map((p) => p.out));
    }, 5);
  };
  peer.on('cfg', (c) => { s.cfg = c; start(); });
  peer.on('pen', (d: { pen: PenId }) => { s.theirPen = d.pen; start(); });
  peer.on('aim', (d: FlickMsg) => { if (s.core && d.n === s.core.seq) s.aims++; expect(d.g).toBe(s.g); });
  peer.on('flick', (d: FlickMsg) => {
    const c = s.core!;
    expect(c.turn).toBe(0); // the stand-in only flicks on its turn
    expect(d.n).toBe(c.seq);
    if (s.aims === 0) s.aimBeforeFlick = false;
    s.aims = 0;
    s.flicksSeen++;
    // Animate it here too (our own floats), then wait for its snapshot.
    s.world!.flick(0, d);
  });
  peer.on('state', (d: StateMsg) => {
    const c = s.core!;
    expect(d.n).toBe(c.seq);
    adopt(s.world!, d.pens);
    after(d.pens.map((p) => p.out));
  });
  peer.send('pen', { pen: myPen });
  return s;
}

describe('Pen Fight online: the stand-in', () => {
  it('sends the settings and its pen, aims before each flick, plays only on its turn, finishes a whole match and answers a rematch', async () => {
    const peer = makePenBot({ name: 'Me', team: 'ban' }, { target: 3 }, 4242, 40);
    const s = headlessPlayer(peer, 'gel');
    for (let i = 0; i < 3000 && s.results.length < 1; i++) await wait(10);
    expect(s.results).toHaveLength(1);
    const [a, b] = s.results[0];
    expect(Math.max(a, b)).toBe(3);
    expect(Math.min(a, b)).toBeLessThan(3);
    expect(s.flicksSeen).toBeGreaterThan(0);
    expect(s.aimBeforeFlick).toBe(true);
    // Rematch: it answers, and in game 2 the player (side 1) starts.
    const answered = new Promise((r) => peer.on('rematch', r));
    peer.send('rematch');
    await answered;
    s.g = 2;
    s.core = new PFCore(3, s.cfg!.seed, 2);
    s.world = new PenWorld([PENS[s.theirPen!], PENS.gel], s.core.poses());
    expect(s.core.turn).toBe(1);
    // Kick off game 2 from our side and let it run to the end too.
    const c = s.core;
    const rng = createRng(8);
    const ai = new PenAI(1, 'medium', rng);
    ai.start(s.world);
    let f = null;
    while (!(f = ai.work(50)));
    peer.send('flick', { g: 2, n: 0, ...f });
    playOut(s.world, 1, f);
    peer.send('state', { g: 2, n: 0, pens: snapOf(s.world) });
    const r = c.settle(s.world.pens.map((p) => p.out));
    if (r.winner !== null) s.world = new PenWorld([PENS[s.theirPen!], PENS.gel], c.poses());
    // From here the stand-in takes its turn; the headless player keeps answering.
    for (let i = 0; i < 3000 && s.results.length < 2; i++) await wait(10);
    expect(s.results).toHaveLength(2);
    peer.close();
  }, 60000);
});
