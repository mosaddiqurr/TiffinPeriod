import { describe, expect, it } from 'vitest';
import { LAST_SECONDS, NDDuel, QUICK, duelLetters, fairVerdict, needsCheck, type DuelLink, type NDSettings } from '../src/games/naam-desh/duel';
import { botAccepts, botWord, makeNaamDeshBot } from '../src/games/naam-desh/bot';
import { LETTERS, knownWord, matchesLetter, type Answers } from '../src/games/naam-desh/model';
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
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const S: NDSettings = { rounds: 3, seconds: 60 };
const fill = (d: NDDuel, a: string[]) => a.forEach((w, c) => d.setAnswer(c, w));

describe('Naam Desh online: letters and rules', () => {
  it('both devices get the same different letters, new ones in a rematch', () => {
    const a = duelLetters({ rounds: 5, seconds: 60 }, 42, 1), b = duelLetters({ rounds: 5, seconds: 60 }, 42, 1);
    expect(a.map((l) => l.bn)).toEqual(b.map((l) => l.bn));
    expect(new Set(a.map((l) => l.bn)).size).toBe(5);
    expect(duelLetters(S, 42, 2).map((l) => l.bn)).not.toEqual(duelLetters(S, 42, 1).map((l) => l.bn));
  });
  it('a verdict cannot reject a known word or accept a wrong letter', () => {
    const k = LETTERS.find((l) => l.bn === 'ক')!;
    const a: Answers = ['করিম', 'কলম্বিয়া', 'জবা', ''];
    expect(needsCheck(k, a)).toEqual([1]);
    expect(fairVerdict(k, a, [false, false, true, true])).toEqual([true, false, false, false]);
    expect(fairVerdict(k, a, [false, true, true, true])).toEqual([true, true, false, false]);
    expect(fairVerdict(k, a, 'junk')).toEqual([true, true, false, false]);
  });
});

describe('Naam Desh online: two devices', () => {
  it('answers stay hidden until both are done, checks go to the other player, and both score the same', async () => {
    const [a, b] = wire();
    let clock = 0;
    const host = new NDDuel(a, 0, S, 7, { now: () => clock });
    const guest = new NDDuel(b, 1, S, 7, { now: () => clock });
    host.attach(); guest.attach();
    expect(host.view.letter.bn).toBe(guest.view.letter.bn);
    const L = host.view.letter;
    const k = (c: number) => L.words[c].find((w) => w.startsWith(L.bn))!;

    // Host: all four known. Guest: known name, an unknown word starting with the letter, a blank, a wrong letter.
    fill(host, [k(0), k(1), k(2), k(3)]);
    const odd = `${L.bn}খখখ`;
    const other = LETTERS.find((l) => l.bn !== L.bn)!;
    fill(guest, [k(0), odd, '', other.words[3][0]]);
    clock = 20000;
    host.finish();
    await settle();
    // Only "done" so far: no answers on the wire.
    expect(a.sent.some(([t]) => t === 'ans')).toBe(false);
    expect(guest.view.theirDone).toBe(true);
    expect(guest.view.deadline).toBe(20000 + LAST_SECONDS * 1000);
    // The guest's last 10 seconds run out: what it typed is handed in.
    clock = 30001;
    guest.tick();
    await settle();
    expect(host.view.phase).toBe('review');
    expect(guest.view.phase).toBe('review');
    // Host checks the guest's unknown word; the guest had nothing to check, so its verdict went at once.
    expect(guest.view.sentReview).toBe(true);
    expect(needsCheck(L, host.view.theirs!)).toEqual([1]);
    host.check(1, false);
    host.sendReview();
    await settle();
    expect(host.view.phase).toBe('between');
    expect(guest.view.phase).toBe('between');
    // Same name for both: 5 each. Host's other three: 10. Guest's rejected/blank/wrong letter: 0.
    expect(host.view.results[0].points).toEqual([[5, 10, 10, 10], [5, 0, 0, 0]]);
    expect(guest.view.results[0].points).toEqual([[5, 0, 0, 0], [5, 10, 10, 10]]);
    expect(host.view.totals).toEqual([35, 5]);
    expect(guest.view.totals).toEqual([5, 35]);

    // Round 2: the review clock runs out, so the unchecked word counts.
    host.next(); guest.next();
    await settle();
    const L2 = host.view.letter;
    expect(guest.view.letter.bn).toBe(L2.bn);
    clock = 40000;
    host.startClock();
    fill(host, [`${L2.bn}পপপ`]);
    host.finish(); guest.finish();
    await settle();
    expect(guest.view.phase).toBe('review');
    clock = 40000 + 16000;
    guest.tick();
    await settle();
    expect(host.view.results[1].points[0][0]).toBe(10);
    expect(guest.view.results[1].points[1][0]).toBe(10);

    // Round 3: nothing written; then the match is over and agrees on both sides.
    host.next(); guest.next();
    await settle();
    host.finish(); guest.finish();
    await settle();
    expect(host.view.phase).toBe('over');
    expect(guest.view.phase).toBe('over');
    expect(host.view.totals).toEqual([...guest.view.totals].reverse());

    host.restart(); guest.restart();
    await settle();
    expect(host.view.g).toBe(2);
    expect(host.view.phase).toBe('write');
    expect(host.view.totals).toEqual([0, 0]);
    expect(host.view.letter.bn).toBe(guest.view.letter.bn);
  });
});

describe('Naam Desh online: the stand-in', () => {
  it('mostly writes known words, sometimes blanks or slips, and judges plausibly', () => {
    const rng = createRng(3);
    let known = 0, blank = 0, other = 0;
    for (let i = 0; i < 800; i++) {
      const l = LETTERS[i % LETTERS.length], c = i % 4;
      const w = botWord(l, c, rng);
      if (!w) blank++; else if (knownWord(l, c, w)) known++; else other++;
    }
    expect(known / 800).toBeGreaterThan(0.7);
    expect(blank).toBeGreaterThan(20);
    expect(other).toBeGreaterThan(20);
    const k = LETTERS.find((l) => l.bn === 'ক')!;
    expect(botAccepts(k, 0, 'জবা', rng)).toBe(false);
    let yes = 0;
    for (let i = 0; i < 100; i++) if (botAccepts(k, 1, 'কলম্বিয়া', rng)) yes++;
    expect(yes).toBeGreaterThan(70);
    expect(matchesLetter(k, 'কলম্বিয়া')).toBe(true);
  });

  it('plays a whole quick match like a host, checks words, and answers a rematch', async () => {
    const speed = 60;
    const peer = makeNaamDeshBot({ name: 'Me', team: '' }, QUICK, 1234, speed);
    expect(peer.them.team).toBe('');
    const cfg = await new Promise<{ settings: NDSettings; seed: number }>((r) => { const off = peer.on('cfg', (c) => { off(); r(c); }); });
    expect(cfg.settings).toEqual(QUICK);
    const me = new NDDuel(peer, 1, cfg.settings, cfg.seed, { scale: speed });
    me.attach();
    const wait = async (ok: () => boolean, ms = 8000) => {
      const t0 = Date.now();
      while (!ok()) { if (Date.now() - t0 > ms) throw new Error(`timed out in ${me.view.phase}`); me.tick(); await new Promise((r) => setTimeout(r, 5)); }
    };
    let checked = 0;
    for (let r = 0; r < QUICK.rounds; r++) {
      await wait(() => me.view.r === r && me.view.phase === 'write');
      const L = me.view.letter;
      fill(me, [L.words[0][0], `${L.bn}টটট`, '', L.words[3][0]]);
      // Wait for the stand-in to finish writing; it also has to beat its clock.
      await wait(() => me.view.theirDone);
      me.finish();
      await wait(() => me.view.phase === 'review');
      for (const c of needsCheck(L, me.view.theirs!)) { me.check(c, true); checked++; }
      me.sendReview();
      await wait(() => me.view.phase === 'between' || me.view.phase === 'over');
      // The stand-in judged my unknown word one way or the other.
      expect(typeof me.view.results[r].accepted[0][1]).toBe('boolean');
      expect(me.view.results[r].accepted[0][2]).toBe(false);
      if (me.view.phase === 'between') me.next();
    }
    expect(me.view.phase).toBe('over');
    expect(me.view.results).toHaveLength(3);
    expect(me.view.totals[1]).toBeGreaterThan(0);
    expect(checked).toBeGreaterThanOrEqual(0);

    const back = new Promise<void>((r) => { const off = peer.on('rematch', () => { off(); r(); }); });
    peer.send('rematch');
    await back;
    me.restart();
    await wait(() => me.view.g === 2 && me.view.phase === 'write');
    // The stand-in hands in by itself when I don't write anything.
    me.finish();
    await wait(() => me.view.phase !== 'write' && me.view.phase !== 'wait');
    peer.close();
  }, 30000);

  it('hurries when the player hands in first, and hands in before the last clock ends', async () => {
    const speed = 20;
    const peer = makeNaamDeshBot({ name: 'Me', team: '' }, QUICK, 99, speed);
    const cfg = await new Promise<{ settings: NDSettings; seed: number }>((r) => { const off = peer.on('cfg', (c) => { off(); r(c); }); });
    const me = new NDDuel(peer, 1, cfg.settings, cfg.seed, { scale: speed });
    me.attach();
    const wait = async (ok: () => boolean, ms = 8000) => {
      const t0 = Date.now();
      while (!ok()) { if (Date.now() - t0 > ms) throw new Error(`timed out in ${me.view.phase}`); if (me.view.phase === 'review') me.tick(); await new Promise((r) => setTimeout(r, 5)); }
    };
    let words = 0;
    for (let r = 0; r < QUICK.rounds; r++) {
      await wait(() => me.view.r === r && me.view.phase === 'write');
      me.finish();
      const t0 = Date.now();
      // The stand-in's own last clock would hand in at LAST_SECONDS; it should beat it.
      await wait(() => me.view.phase === 'review' || me.view.phase === 'between' || me.view.phase === 'over');
      expect(Date.now() - t0).toBeLessThan((LAST_SECONDS * 1000) / speed + 300);
      await wait(() => me.view.phase === 'between' || me.view.phase === 'over');
      words += me.view.results[r].answers[1].filter((w) => w).length;
      if (me.view.phase === 'between') me.next();
    }
    expect(words).toBeGreaterThanOrEqual(3);
    peer.close();
  }, 30000);
});
