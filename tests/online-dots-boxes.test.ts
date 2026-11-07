import { describe, expect, it } from 'vitest';
import { makeDotsBot } from '../src/games/dots-boxes/online';
import { apply, freeLines, newGame } from '../src/games/dots-boxes/model';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Dots and Boxes online: the stand-in', () => {
  it('sends the settings first, plays only on its turn, and finishes a whole game', async () => {
    const peer = makeDotsBot({ name: 'Me', team: 'ban' }, { size: 3 }, 9, 60);
    const cfg = await new Promise<{ settings: { size: number }; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg.settings.size).toBe(3);
    let st = newGame(3, 3, 0); // the stand-in is side 0 and starts
    peer.on('line', (d: { g: number; l: number }) => {
      expect(d.g).toBe(1);
      expect(st.turn).toBe(0);
      st = apply(st, d.l);
    });
    for (let i = 0; i < 400 && !st.done; i++) {
      await wait(15);
      if (st.turn === 1 && !st.done) {
        const l = freeLines(st)[0];
        st = apply(st, l);
        peer.send('line', { g: 1, l });
      }
    }
    expect(st.done).toBe(true);
    expect(st.score[0] + st.score[1]).toBe(9);
    // Rematch: it answers, and in game 2 the player starts.
    const answered = new Promise((r) => peer.on('rematch', r));
    peer.send('rematch');
    await answered;
    peer.close();
  }, 30000);
});
