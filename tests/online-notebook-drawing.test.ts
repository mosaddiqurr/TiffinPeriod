import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { DOODLE_OF, DRAW_SECONDS, NDDuel, WORDS, drawerPoints, guesserPoints, type NDLink, type NDView } from '../src/games/notebook-drawing/duel';
import { makeNotebookBot } from '../src/games/notebook-drawing/bot';
import { inkLength, samplePath } from '../src/games/notebook-drawing/paths';
import { DOODLES } from '../src/games/notebook-drawing/words';

/** Two in-memory ends that deliver in order, after a tick. */
function wire(): [NDLink & { log: Array<[string, any]> }, NDLink & { log: Array<[string, any]> }] {
  type H = Map<string, Set<(d: any) => void>>;
  const ha: H = new Map(), hb: H = new Map();
  const mk = (mine: H, theirs: H) => {
    const end = {
      log: [] as Array<[string, any]>,
      send: (type: string, data?: unknown) => {
        const d = JSON.parse(JSON.stringify(data ?? null));
        end.log.push([type, d]);
        queueMicrotask(() => theirs.get(type)?.forEach((cb) => cb(d)));
      },
      on: (type: string, cb: (d: any) => void) => { if (!mine.has(type)) mine.set(type, new Set()); mine.get(type)!.add(cb); return () => mine.get(type)?.delete(cb); },
    };
    return end;
  };
  return [mk(ha, hb), mk(hb, ha)];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(5); }
}

describe('drawings without a browser', () => {
  it('samples the doodles into points on the page', () => {
    const sun = samplePath(DOODLES[0].strokes[0]);
    // A circle of radius 40 round (100, 100).
    for (const [x, y] of sun) expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(40, 0);
    expect(inkLength([{ color: '#000', w: 2, pts: sun }])).toBeGreaterThan(240);
    for (const d of DOODLES) for (const s of d.strokes) {
      const pts = samplePath(s);
      expect(pts.length).toBeGreaterThan(2);
      for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(201); expect(y).toBeGreaterThanOrEqual(-1); expect(y).toBeLessThanOrEqual(201); }
    }
    expect(DOODLE_OF.size).toBe(DOODLES.length);
    expect(new Set(WORDS.map((w) => w.en)).size).toBe(WORDS.length);
  });
});

describe('online Notebook Drawing (two devices)', () => {
  it('pick, live ink, a wrong guess, a right guess: both see the same page and scores', async () => {
    const [a, b] = wire();
    const host = new NDDuel(a, 0, { each: 2 }, { rng: createRng(3) });
    const guest = new NDDuel(b, 1, { each: 2 }, { rng: createRng(4) });
    expect(host.view.phase).toBe('pick');
    expect(host.view.choices).toHaveLength(3);
    expect(guest.view.choices).toHaveLength(0);
    expect(guest.choose(0)).toBe(false);
    expect(host.choose(1)).toBe(true);
    await wait(5);
    expect(guest.view.phase).toBe('draw');
    expect(guest.view.word).toBe(host.view.word);
    expect(guest.view.opts).toContain(host.view.word);
    expect(guest.view.opts).toHaveLength(6);
    // Draw two strokes, undo one, draw again.
    host.begin('#1f3a93', 2.2, 20, 20);
    for (let i = 1; i <= 30; i++) host.point(20 + i * 3, 20 + i * 2);
    host.begin('#c62f2f', 2.2, 150, 150);
    host.point(160, 160);
    host.undo();
    host.begin('#127a59', 9, 100, 40);
    host.point(100, 80);
    await wait(200);
    expect(guest.view.strokes).toEqual(host.view.strokes);
    expect(guest.view.strokes).toHaveLength(2);
    expect(guest.view.ink).toBeCloseTo(host.view.ink, 5);
    // Few messages: ink goes in batches.
    expect(a.log.filter(([t]) => t === 'ink').length).toBeLessThanOrEqual(3);
    // Every point is 0…1 of the page.
    for (const [, d] of a.log.filter(([t]) => t === 'ink')) for (const op of d.ops) if (op.p) for (const n of op.p) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1); }
    // A clear wipes the guesser's page too.
    host.clear();
    await wait(200);
    expect(guest.view.strokes).toEqual([]);
    // Wrong guess: the guesser waits; the drawer sees it.
    const wrong = guest.view.opts.find((w) => w !== guest.view.word)!;
    expect(guest.guess(wrong)).toBe(true);
    expect(guest.guess(guest.view.word)).toBe(false); // locked for a moment
    await wait(5);
    expect(host.view.wrong).toEqual([wrong]);
    guest.view.lockUntil = 0; // skip the pause
    expect(guest.guess(guest.view.word)).toBe(true);
    await wait(5);
    expect(host.view.phase).toBe('reveal');
    expect(guest.view.phase).toBe('reveal');
    expect(host.view.last).toEqual(guest.view.last);
    const left = host.view.last!.left;
    expect(left).toBeGreaterThan(DRAW_SECONDS - 3);
    expect(host.view.scores).toEqual([drawerPoints(left), guesserPoints(left)]);
    expect(guest.view.scores).toEqual(host.view.scores);
    // Stale and out-of-turn messages are ignored.
    b.send('guess', { g: 1, r: 0, w: host.view.word });
    b.send('end', { g: 1, r: 0, got: true, left: 70 });
    await wait(5);
    expect(host.view.scores).toEqual(guest.view.scores);
    host.dispose(); guest.dispose();
  });

  it('time runs out, players swap, the game ends the same on both, and a rematch starts the other way round', async () => {
    const [a, b] = wire();
    const speed = 100;
    const host = new NDDuel(a, 0, { each: 2 }, { speed });
    const guest = new NDDuel(b, 1, { each: 2 }, { speed });
    const drawers: number[] = [];
    let lastR = -1;
    const watch = (v: NDView) => { if (v.phase === 'draw' && v.r !== lastR) { lastR = v.r; drawers.push(v.drawer); } };
    host.onChange(watch);
    // Nobody picks: the word is chosen for the drawer when the 10 s are up. Nobody guesses either.
    await until(() => host.view.phase === 'done' && guest.view.phase === 'done', 15000);
    expect(drawers).toEqual([0, 1, 0, 1]);
    expect(host.view.scores).toEqual([0, 0]);
    expect(guest.view.scores).toEqual([0, 0]);
    expect(host.winner()).toBeNull();
    // Rematch: the guest restarts first and picks at once; the host catches up afterwards.
    guest.restart();
    expect(guest.view.drawer).toBe(1);
    guest.choose(0);
    await wait(5);
    host.restart();
    await wait(5);
    expect(host.view.g).toBe(2);
    expect(host.view.phase).toBe('draw');
    expect(host.view.word).toBe(guest.view.word);
    host.guess(host.view.word);
    await until(() => guest.view.phase === 'reveal');
    expect(guest.view.scores[0]).toBeGreaterThan(guest.view.scores[1]);
    await wait(5);
    expect(host.view.scores).toEqual(guest.view.scores);
    host.dispose(); guest.dispose();
  }, 20000);
});

describe('the stand-in', () => {
  it('plays a whole match like a player: draws its doodles, guesses, and takes a rematch', async () => {
    const speed = 40;
    const peer = makeNotebookBot({ name: 'Me', team: 'ban' }, { each: 2 }, 77, speed);
    const cfg = await new Promise<any>((r) => peer.on('cfg', r));
    expect(cfg.settings).toEqual({ each: 2 });
    expect(peer.them.name).not.toMatch(/bot|computer/i);
    const me = new NDDuel(peer, 1, cfg.settings, { speed, rng: createRng(9) });
    const rng = createRng(5);
    const seenInk: number[] = [];
    let botTries = 0;
    const botWords = new Set<number>();
    let drawing = '';
    peer.on('guess', () => { botTries++; });
    // The player: picks quickly, draws a scribble, and guesses right once a bit is drawn.
    me.onChange((v) => {
      const key = `${v.g}|${v.r}|${v.phase}`;
      if (key === drawing) return;
      if (v.phase === 'pick' && v.drawer === 1) { drawing = key; setTimeout(() => me.choose(0), 20); }
      if (v.phase === 'draw' && v.drawer === 1) {
        drawing = key;
        let i = 0;
        const iv = setInterval(() => {
          if (me.view.phase !== 'draw' || i > 400) { clearInterval(iv); return; }
          if (i % 25 === 0) me.begin('#1f3a93', 2.2, 20 + rng.range(0, 150), 20 + rng.range(0, 150));
          else me.point(20 + rng.range(0, 160), 20 + rng.range(0, 160));
          i++;
        }, 3);
      }
      if (v.phase === 'draw' && v.drawer === 0) botWords.add(v.word);
      if (v.phase === 'draw' && v.drawer === 0 && v.ink > 200 && !v.sent) { seenInk.push(v.ink); me.guess(v.word); }
    });
    await until(() => me.view.phase === 'done', 20000);
    const first = me.view.scores;
    // The stand-in drew two of its doodles (the computer's words) and I guessed them.
    expect(seenInk.length).toBeGreaterThan(0);
    expect(first[1]).toBeGreaterThan(0);
    expect(botTries).toBeGreaterThan(0);
    expect(botWords.size).toBe(2);
    for (const w of botWords) expect(DOODLE_OF.has(w)).toBe(true);
    // Rematch: it answers.
    let back = false;
    peer.on('rematch', () => { back = true; me.restart(); });
    peer.send('rematch');
    await until(() => back, 5000);
    expect(me.view.g).toBe(2);
    expect(me.view.drawer).toBe(1);
    await until(() => me.view.phase === 'done', 20000);
    me.dispose();
    peer.close();
  }, 45000);
});
