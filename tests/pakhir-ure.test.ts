import { describe, expect, it } from 'vitest';
import { ITEMS, artFor } from '../src/games/pakhir-ure/items';
import { PakhirEngine, type EngineConfig } from '../src/games/pakhir-ure/engine';
import { createRng } from '../src/engine/rng';

const solo = (input: 'lift' | 'tap' = 'lift'): EngineConfig => ({ players: [{ ai: false }], input, lives: 3, calls: null, aiDifficulty: 'medium' });

/** Run the engine until a call starts. Returns the time of the call. */
function untilCall(e: PakhirEngine, t0: number): number {
  let t = t0;
  for (let i = 0; i < 4000 && e.phase !== 'call'; i++) { t += 10; e.tick(t); }
  return t;
}

describe('Pakhir Ure data', () => {
  it('has unique ids, both languages and a picture for every item', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(ITEMS.length);
    for (const it of ITEMS) {
      expect(it.name.bn.length).toBeGreaterThan(0);
      expect(it.name.en.length).toBeGreaterThan(0);
      expect(artFor(it.id), it.id).toBeTruthy();
      if (it.tricky) expect(it.note, it.id).toBeTruthy();
    }
  });
  it('has enough flyers and non-flyers for fair play', () => {
    const fly = ITEMS.filter((i) => i.flies).length;
    expect(fly).toBeGreaterThan(12);
    expect(ITEMS.length - fly).toBeGreaterThan(12);
  });
});

describe('Pakhir Ure engine', () => {
  it('waits until the finger is down (lift mode)', () => {
    const e = new PakhirEngine(solo(), ITEMS, createRng(1));
    e.tick(0); e.tick(5000);
    expect(e.phase).toBe('ready');
    e.press(0, 5000);
    e.tick(5001);
    expect(e.phase).toBe('gap');
  });
  it('scores a fast lift for a flyer and a held finger for a non-flyer', () => {
    const e = new PakhirEngine(solo(), ITEMS, createRng(2));
    e.press(0, 0);
    let t = 0;
    let checked = { fly: false, still: false };
    for (let round = 0; round < 30 && !(checked.fly && checked.still); round++) {
      e.press(0, t);
      t = untilCall(e, t);
      const item = e.item!;
      if (item.flies) {
        e.release(0, t + 300);
        expect(e.players[0].feedback).toMatchObject({ ok: true, reason: 'lifted' });
        expect(e.players[0].feedback!.points).toBeGreaterThan(100);
        checked.fly = true;
      } else {
        for (let k = 0; k < 200 && e.phase === 'call'; k++) { t += 10; e.tick(t); }
        expect(e.players[0].feedback).toMatchObject({ ok: true, reason: 'held' });
        checked.still = true;
      }
      for (let k = 0; k < 400 && e.phase !== 'ready'; k++) { t += 10; e.tick(t); }
    }
    expect(checked).toEqual({ fly: true, still: true });
  });
  it('treats a lift faster than 120 ms as a false start', () => {
    const e = new PakhirEngine(solo(), ITEMS, createRng(4));
    e.press(0, 0);
    const t = untilCall(e, 0);
    e.release(0, t + 50);
    expect(e.players[0].feedback).toMatchObject({ ok: false, reason: 'early' });
    expect(e.players[0].lives).toBe(2);
  });
  it('treats a lift before the call as a false start', () => {
    const e = new PakhirEngine(solo(), ITEMS, createRng(5));
    e.press(0, 0);
    e.tick(1);
    expect(e.phase).toBe('gap');
    e.release(0, 50);
    const t = untilCall(e, 50);
    e.tick(t);
    expect(e.players[0].feedback?.reason).toBe('early');
  });
  it('ends solo play after three mistakes', () => {
    const e = new PakhirEngine(solo('tap'), ITEMS, createRng(6));
    let t = 0;
    for (let k = 0; k < 20000 && e.phase !== 'over'; k++) {
      t += 10;
      e.tick(t);
      // Tap at every call: wrong for every non-flyer.
      if (e.phase === 'call' && !e.players[0].judged && t - e.callAt > 200) e.press(0, t);
    }
    expect(e.phase).toBe('over');
    expect(e.players[0].lives).toBe(0);
  });
  it('versus mode ends after the set number of calls and the computer plays', () => {
    const e = new PakhirEngine({ players: [{ ai: false }, { ai: true }], input: 'tap', lives: null, calls: 8, aiDifficulty: 'hard' }, ITEMS, createRng(8));
    let t = 0;
    for (let k = 0; k < 30000 && e.phase !== 'over'; k++) { t += 10; e.tick(t); }
    expect(e.phase).toBe('over');
    expect(e.callIndex).toBe(8);
    expect(e.players[1].correct + e.players[1].wrong).toBe(8);
    expect(e.players[1].correct).toBeGreaterThan(4);
  });
  it('shrinks the response window but keeps a floor', () => {
    expect(PakhirEngine.windowFor(0)).toBe(1500);
    expect(PakhirEngine.windowFor(100)).toBe(700);
  });
});
