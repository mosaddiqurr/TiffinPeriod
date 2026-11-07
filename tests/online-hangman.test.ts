import { describe, expect, it } from 'vitest';
import { HMDuel, ROUNDS, duelWords, judge, type DuelLink, type HMSettings, type Prog } from '../src/games/hangman/duel';
import { botLetter, freqOrder, makeHangmanBot } from '../src/games/hangman/bot';
import { allLetters, keyboard, newRound, guess } from '../src/games/hangman/model';
import { CATEGORIES } from '../src/games/hangman/words';
import { createRng } from '../src/engine/rng';

function wire(): [DuelLink & { sent: Array<[string, any]> }, DuelLink & { sent: Array<[string, any]> }] {
  type H = Map<string, Set<(d: any) => void>>;
  const ha: H = new Map(), hb: H = new Map();
  const mk = (mine: H, theirs: H) => {
    const end = {
      sent: [] as Array<[string, any]>,
      send: (type: string, data?: unknown) => {
        const d = JSON.parse(JSON.stringify(data ?? null));
        end.sent.push([type, d]);
        queueMicrotask(() => theirs.get(type)?.forEach((cb) => cb(d)));
      },
      on: (type: string, cb: (d: any) => void) => { if (!mine.has(type)) mine.set(type, new Set()); mine.get(type)!.add(cb); return () => mine.get(type)?.delete(cb); },
    };
    return end;
  };
  return [mk(ha, hb), mk(hb, ha)];
}
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const S: HMSettings = { cat: 'any', script: 'en', lives: 8 };

/** Guess the word's own letters first (a perfect solver), `wrongFirst` misses before that. */
async function solve(d: HMDuel, wrongFirst = 0) {
  const st = d.view.st;
  const need = allLetters(st);
  const misses = keyboard(st.script).filter((l) => !need.includes(l)).slice(0, wrongFirst);
  for (const l of misses) d.guess(l);
  for (const l of need) d.guess(l);
}

describe('Hangman word duel: words and judging', () => {
  it('both devices get the same three different words from the seed, new ones in a rematch', () => {
    for (const script of ['bn', 'en'] as const) {
      const a = duelWords({ ...S, script }, 1234, 1), b = duelWords({ ...S, script }, 1234, 1);
      expect(a.map((w) => w.word)).toEqual(b.map((w) => w.word));
      expect(new Set(a.map((w) => w.word)).size).toBe(ROUNDS);
      for (const w of a) expect(w.cat[script]).toContain(w.word);
      expect(duelWords({ ...S, script }, 1234, 2).map((w) => w.word)).not.toEqual(a.map((w) => w.word));
    }
    const fruit = duelWords({ cat: 'fruit', script: 'bn', lives: 8 }, 77, 1);
    expect(fruit.every((w) => w.cat.id === 'fruit')).toBe(true);
  });
  it('solving beats failing; then fewer wrong guesses; then faster', () => {
    const p = (o: Partial<Prog>): Prog => ({ g: 1, r: 0, shown: [], wrong: 0, status: 'won', ms: 1000, n: 5, ...o });
    expect(judge(p({}), p({ status: 'lost' }))).toBe(1);
    expect(judge(p({ status: 'lost' }), p({}))).toBe(-1);
    expect(judge(p({ status: 'lost', wrong: 8 }), p({ status: 'lost', wrong: 8 }))).toBe(0);
    expect(judge(p({ wrong: 1, ms: 9000 }), p({ wrong: 2, ms: 1000 }))).toBe(1);
    expect(judge(p({ wrong: 2, ms: 3000 }), p({ wrong: 2, ms: 4000 }))).toBe(1);
    expect(judge(p({ wrong: 2, ms: 4000 }), p({ wrong: 2, ms: 3000 }))).toBe(-1);
  });
  it('a timeout counts as one wrong guess and never blocks a key', () => {
    const [a] = wire();
    const d = new HMDuel(a, 0, S, 5);
    d.attach();
    d.timeout();
    expect(d.view.st.wrong).toHaveLength(1);
    expect(keyboard('en').some((k) => d.view.st.wrong.includes(k))).toBe(false);
    for (let i = 0; i < 7; i++) d.timeout();
    expect(d.view.st.status).toBe('lost');
    expect(d.view.phase).toBe('wait');
  });
});

describe('Hangman word duel: two devices', () => {
  it('progress shows as positions only, both judge every round the same, and a rematch starts over', async () => {
    const [a, b] = wire();
    let clock = 0;
    const host = new HMDuel(a, 0, S, 999, () => clock);
    const guest = new HMDuel(b, 1, S, 999, () => clock);
    host.attach(); guest.attach();
    expect(a.sent[0]).toEqual(['start', { g: 1, r: 0 }]);
    expect(host.view.st.word).toBe(guest.view.st.word);

    // Round 1: the host solves cleanly; the guest makes 2 misses first.
    clock = 4000; await solve(host);
    clock = 6000; await solve(guest, 2);
    await settle();
    const prog = a.sent.filter(([t]) => t === 'prog').map(([, d]) => d);
    expect(JSON.stringify(prog)).not.toContain(host.view.st.word); // no letters, only positions
    expect(prog.at(-1)).toMatchObject({ status: 'won', wrong: 0, ms: 4000 });
    expect(host.view.phase).toBe('between');
    expect(guest.view.phase).toBe('between');
    expect(host.view.results[0].win).toBe(1);
    expect(guest.view.results[0].win).toBe(-1);
    expect(guest.view.opp?.shown.length).toBe(host.view.st.needs.filter((x) => x.length).length);

    // Round 2: both solve cleanly; the guest is faster.
    host.next(); guest.next();
    await settle();
    clock = 9000; await solve(guest);
    clock = 12000; await solve(host);
    await settle();
    expect(host.view.results[1].win).toBe(-1);
    expect(guest.view.results[1].win).toBe(1);

    // Round 3: the guest runs out of time 8 times; the host fails too (both lose: a draw).
    host.next(); guest.next();
    await settle();
    for (let i = 0; i < 8; i++) guest.timeout();
    const need = allLetters(host.view.st);
    for (const l of keyboard('en').filter((k) => !need.includes(k)).slice(0, 8)) host.guess(l);
    await settle();
    expect(host.view.phase).toBe('over');
    expect(guest.view.phase).toBe('over');
    expect(host.view.results[2].win).toBe(0);
    expect(host.view.tally).toEqual([1, 1]);
    expect(guest.view.tally).toEqual([1, 1]);

    host.restart(); guest.restart();
    await settle();
    expect(host.view.g).toBe(2);
    expect(host.view.phase).toBe('play');
    expect(host.view.tally).toEqual([0, 0]);
    expect(host.view.st.word).toBe(guest.view.st.word);
    // Stale progress from game 1 is not shown in game 2.
    expect(host.view.opp).toBeNull();
  });
  it('progress for the next round that arrives early is kept until that round opens', async () => {
    const [a, b] = wire();
    const host = new HMDuel(a, 0, S, 31);
    const guest = new HMDuel(b, 1, S, 31);
    host.attach(); guest.attach();
    await solve(host); await solve(guest);
    await settle();
    guest.next();
    guest.guess(allLetters(guest.view.st)[0]);
    await settle();
    expect(host.view.phase).toBe('between');
    host.next();
    expect(host.view.opp?.n).toBe(1);
  });
});

describe('Hangman word duel: the stand-in', () => {
  it('guesses common letters first and words that fit the clue later', () => {
    expect(freqOrder('en').slice(0, 3)).toEqual(['E', 'A', 'I']);
    expect(new Set(freqOrder('bn'))).toEqual(new Set(keyboard('bn')));
    const rng = createRng(3);
    let st = newRound('MANGO', 'en', 8);
    for (const l of ['M', 'A', 'N', 'G']) st = guess(st, l);
    const picks = new Set<string>();
    for (let i = 0; i < 30; i++) picks.add(botLetter(st, rng, 1, CATEGORIES[0].en));
    expect(picks.has('O')).toBe(true);
  });
  it('solves most words like a person: in both languages, with some misses', () => {
    for (const script of ['en', 'bn'] as const) {
      const rng = createRng(11);
      let solved = 0, wrong = 0, total = 0;
      for (const c of CATEGORIES) for (const w of c[script].slice(0, 8)) {
        let st = newRound(w, script, 8);
        for (let i = 0; i < 80 && st.status === 'play'; i++) st = guess(st, botLetter(st, rng, 0.65, c[script]));
        total++; if (st.status === 'won') solved++; wrong += st.wrong.length;
      }
      expect(solved / total).toBeGreaterThan(0.4);
      expect(wrong / total).toBeGreaterThan(1);
    }
  });
  it('plays a whole match after each "start", and answers a rematch', async () => {
    const peer = makeHangmanBot({ name: 'Me', team: 'ban' }, { cat: 'any', script: 'bn', lives: 8 }, 4242, 60);
    const cfg = await new Promise<{ settings: HMSettings; seed: number }>((r) => peer.on('cfg', r));
    expect(cfg.seed).toBe(4242);
    const me = new HMDuel(peer, 1, cfg.settings, cfg.seed);
    me.attach();
    const theirStarts: number[] = [];
    peer.on('start', (d: { r: number }) => theirStarts.push(d.r));
    for (let r = 0; r < ROUNDS; r++) {
      await solve(me, r); // 0, 1, 2 misses
      for (let i = 0; i < 400 && me.view.phase === 'wait'; i++) await wait(10);
      expect(['between', 'over']).toContain(me.view.phase);
      expect(me.view.opp?.status).not.toBe('play');
      if (r < ROUNDS - 1) me.next();
    }
    expect(me.view.phase).toBe('over');
    expect(me.view.results).toHaveLength(ROUNDS);
    expect(theirStarts).toEqual([0, 1, 2]);
    // Rematch: it answers, then plays game 2.
    const answered = new Promise((r) => peer.on('rematch', r));
    peer.send('rematch');
    await answered;
    me.restart();
    for (let i = 0; i < 400 && !(me.view.opp && me.view.opp.n > 0); i++) await wait(10);
    expect(me.view.g).toBe(2);
    expect(me.view.opp?.g).toBe(2);
    peer.close();
  }, 30000);
});
