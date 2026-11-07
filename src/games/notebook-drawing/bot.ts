import type { Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { DOODLE_OF, NDDuel, type NDSettings, type NDView } from './duel';
import { COLORS, samplePath } from './paths';
import { DOODLES } from './words';

// The quick-match stand-in for Notebook Drawing. It plays side 0 of NDDuel through the shared
// pretend connection, like any player.
// Drawing: it only offers itself words the computer has a doodle for, and draws that doodle
// stroke by stroke at a human pace (a little wobbly, small pauses between strokes, a slightly
// different size and place each time).
// Guessing: it watches how much ink has appeared. It makes a few plausible wrong guesses, and
// the right one once "enough" of the drawing is there, sooner the more is drawn. Now and then it
// never works it out.

export const QUICK: NDSettings = { each: 2 };

export function drawingBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: NDSettings }) => {
    const rng = ctx.rng;
    let duel: NDDuel | null = null;
    let seen = '';
    let closed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let iv: ReturnType<typeof setInterval> | undefined;
    const after = (ms: number, fn: () => void) => { const t = setTimeout(() => { timers.delete(t); if (!closed) fn(); }, ms); timers.add(t); };
    const stopLoop = () => { if (iv) clearInterval(iv); iv = undefined; };
    // A steady hand or a quick one, for the whole match.
    const pace = rng.range(110, 170);

    const draw = (d: NDDuel, v: NDView) => {
      const di = DOODLE_OF.get(v.word);
      if (di === undefined) return;
      const s = rng.range(0.82, 1), ox = rng.range(-12, 12) + 100 * (1 - s), oy = rng.range(-10, 10) + 100 * (1 - s);
      // A gentle, slow wobble, like a hand (not a jagged random shake).
      const strokes = DOODLES[di].strokes.map((p) => {
        const ph = rng.range(0, 6.28), f = rng.range(0.05, 0.12), a = rng.range(0.6, 1.4);
        return samplePath(p).map(([x, y], k) => [x * s + ox + Math.sin(ph + k * f) * a, y * s + oy + Math.cos(ph * 1.3 + k * f * 0.8) * a] as [number, number]);
      });
      const color = rng.chance(0.7) ? COLORS[0] : rng.pick(COLORS);
      const key = `${v.g}|${v.r}`;
      let si = 0, pi = 0;
      let wait = Date.now() + thinkMs(rng, 0.4, 1.2, speed);
      const tick = 40;
      stopLoop();
      iv = setInterval(() => {
        const cur = d.view;
        if (closed || `${cur.g}|${cur.r}` !== key || cur.phase !== 'draw' || si >= strokes.length) { stopLoop(); return; }
        if (Date.now() < wait) return;
        const st = strokes[si];
        if (pi === 0) { d.begin(color, 2.4, st[0][0], st[0][1]); pi = 1; }
        let budget = (pace * tick) / 1000;
        while (pi < st.length && budget > 0) {
          budget -= Math.hypot(st[pi][0] - st[pi - 1][0], st[pi][1] - st[pi - 1][1]);
          d.point(st[pi][0], st[pi][1]);
          pi++;
        }
        if (pi >= st.length) { si++; pi = 0; wait = Date.now() + thinkMs(rng, 0.25, 0.9, speed); }
      }, tick / speed);
    };

    const guessLoop = (d: NDDuel, v: NDView) => {
      const key = `${v.g}|${v.r}`;
      const fail = rng.chance(0.15);
      const needed = rng.range(160, 520);
      const maxWrong = rng.int(0, 3) + (fail ? 1 : 0);
      const t0 = Date.now();
      let wrongs = 0;
      stopLoop();
      iv = setInterval(() => {
        const cur = d.view;
        if (closed || `${cur.g}|${cur.r}` !== key || cur.phase !== 'draw') { stopLoop(); return; }
        if (cur.sent || d.locked()) return;
        const secs = ((Date.now() - t0) * speed) / 1000;
        const frac = cur.ink / needed;
        if (!fail && secs > 3 && frac >= 0.6 && rng.chance(Math.min(0.6, 0.12 + (frac - 0.6) * 0.5))) { d.guess(cur.word); return; }
        if (cur.ink > 50 && wrongs < maxWrong && rng.chance(0.14)) {
          const others = cur.opts.filter((w) => w !== cur.word && !cur.wrong.includes(w));
          if (others.length) { d.guess(rng.pick(others)); wrongs++; }
        }
      }, 800 / speed);
    };

    const act = (v: NDView) => {
      const d = duel;
      if (!d || closed) return;
      const key = `${v.g}|${v.r}|${v.phase}`;
      if (key === seen) return;
      seen = key;
      if (v.phase === 'pick' && d.iDraw) after(thinkMs(rng, 1.5, 4, speed), () => d.choose(rng.int(0, 2)));
      else if (v.phase === 'draw' && d.iDraw) draw(d, v);
      else if (v.phase === 'draw') guessLoop(d, v);
      else stopLoop();
    };

    const offRematch = end.on('rematch', () => {
      // Always up for another game.
      after(thinkMs(rng, 1, 2.2, speed), () => { end.send('rematch'); duel?.restart(); });
    });
    // Start when the player's match screen opens ("Player found!" shows first).
    after(1800 / speed, () => {
      duel = new NDDuel(end, 0, ctx.settings, { speed, rng, doodleOnly: true });
      duel.onChange(act);
      act(duel.view);
    });
    return () => { closed = true; offRematch(); stopLoop(); timers.forEach(clearTimeout); duel?.dispose(); };
  };
}

/** `speed` > 1 makes everything faster (tests only). */
export function makeNotebookBot(me: Profile, settings: NDSettings = QUICK, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: drawingBrain(speed), speed });
}
