import type { Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { LETTERS, knownWord, matchesLetter, type Letter } from './model';
import { LAST_SECONDS, NDDuel, needsCheck, type NDSettings } from './duel';

// The quick-match stand-in. It writes like a person: one column at a time in any order,
// several seconds each, mostly words from the reference list for that letter (Bangla
// spelling first). Now and then it leaves a column blank, puts a word in the wrong column
// (it starts with the letter, so it goes to the player to check), or slips and writes a word
// for another letter. If the player finishes first it hands in whatever it has when its
// short final clock ends. When checking the player's words it accepts plausible ones.

/** What the stand-in writes in one column (empty = left blank). */
export function botWord(letter: Letter, cat: number, rng: Rng): string {
  const roll = rng.next();
  if (roll < 0.1) return '';
  if (roll < 0.17) {
    // A word for this letter, but from another column.
    const other = [0, 1, 2, 3].filter((c) => c !== cat).flatMap((c) => letter.words[c].filter((w) => w.startsWith(letter.bn) && !knownWord(letter, cat, w)));
    if (other.length) return rng.pick(other);
  }
  if (roll < 0.21) {
    // A slip: a word that starts with another letter.
    const l = rng.pick(LETTERS.filter((x) => x.bn !== letter.bn));
    return rng.pick(l.words[cat].filter((w) => w.startsWith(l.bn)));
  }
  const bangla = letter.words[cat].filter((w) => w.startsWith(letter.bn));
  return rng.pick(bangla.length && rng.chance(0.9) ? bangla : letter.words[cat]);
}

/** Would the stand-in accept this unknown word in this column? */
export function botAccepts(letter: Letter, cat: number, word: string, rng: Rng): boolean {
  if (!matchesLetter(letter, word)) return false;
  // A listed word in the wrong column is easy to spot.
  if ([0, 1, 2, 3].some((c) => c !== cat && knownWord(letter, c, word))) return rng.chance(0.15);
  if ([...word.trim()].length < 3) return rng.chance(0.5);
  return rng.chance(0.88);
}

export function naamDeshBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: NDSettings; seed: number }) => {
    const rng = ctx.rng;
    const duel = new NDDuel(end, 0, ctx.settings, ctx.seed, { scale: speed });
    const pace = rng.range(0.8, 1.2);
    let timers: Array<ReturnType<typeof setTimeout>> = [];
    let going = false;
    let closed = false;
    let asked = false;
    let reviewing = '';
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const later = (ms: number, f: () => void) => { timers.push(setTimeout(() => { if (!closed) f(); }, ms)); };

    // This round's plan: the word for each column ('' = left blank) and which are written.
    let plan: string[] = [];
    let written = new Set<number>();
    let hurried = '';
    const put = (g: number, r: number, cat: number) => {
      if (duel.view.g !== g || duel.view.r !== r || duel.view.phase !== 'write') return;
      duel.setAnswer(cat, plan[cat]);
      written.add(cat);
    };
    const handIn = (g: number, r: number) => { if (duel.view.g === g && duel.view.r === r) duel.finish(); };

    const write = () => {
      clear();
      const v = duel.view;
      plan = [0, 1, 2, 3].map((cat) => botWord(v.letter, cat, rng));
      written = new Set();
      const order = [0, 1, 2, 3].sort(() => rng.next() - 0.5);
      let at = thinkMs(rng, 1.5, 4, speed) * pace;
      for (const cat of order) {
        at += thinkMs(rng, 3.5, 10, speed) * pace;
        if (plan[cat]) later(at, () => put(v.g, v.r, cat));
      }
      later(at + thinkMs(rng, 0.8, 2.5, speed), () => handIn(v.g, v.r));
    };

    // The player is done: write what it can quickly, and hand in before the last clock ends.
    const hurry = () => {
      const v = duel.view;
      const k = `${v.g}:${v.r}`;
      if (v.phase !== 'write' || !going || hurried === k) return;
      hurried = k;
      clear();
      const limit = (LAST_SECONDS - 1.2) * 1000 / speed;
      let at = thinkMs(rng, 0.6, 1.6, speed);
      for (const cat of [0, 1, 2, 3].filter((c) => plan[c] && !written.has(c))) {
        at += thinkMs(rng, 1.4, 3.2, speed);
        if (at < limit) later(at, () => put(v.g, v.r, cat));
      }
      later(Math.min(at + thinkMs(rng, 0.3, 0.9, speed), limit), () => handIn(v.g, v.r));
    };

    const review = () => {
      const v = duel.view;
      const k = `${v.g}:${v.r}`;
      if (v.phase !== 'review' || v.sentReview || !v.theirs || reviewing === k) return;
      reviewing = k;
      const theirs = v.theirs;
      later(thinkMs(rng, 2, 6, speed), () => {
        if (duel.view.g !== v.g || duel.view.r !== v.r) return;
        for (const c of needsCheck(v.letter, theirs)) duel.check(c, botAccepts(v.letter, c, theirs[c], rng));
        duel.sendReview();
      });
    };

    const ticker = setInterval(() => { if (!closed) duel.tick(); }, Math.max(20, 200 / speed));
    const offs = [
      end.on('start', (d: { g: number; r: number }) => {
        if (closed || d.g !== duel.view.g) return;
        if (d.r === duel.view.r + 1 && duel.view.phase === 'between') duel.next();
        if (d.r === duel.view.r && duel.view.phase === 'write' && !going) { going = true; write(); duel.startClock(); }
      }),
      end.on('rematch', () => {
        if (asked || closed) return;
        asked = true;
        clear();
        later(thinkMs(rng, 1, 2.4, speed), () => {
          asked = false;
          going = false;
          end.send('rematch');
          duel.restart();
        });
      }),
    ];
    duel.onChange((v) => {
      if (v.phase !== 'write') going = false;
      else if (v.theirDone) hurry();
      if (v.phase === 'review') review();
    });
    duel.attach();
    return () => { closed = true; clear(); clearInterval(ticker); offs.forEach((f) => f()); duel.dispose(); };
  };
}

/** `speed` > 1 makes everything faster (tests only). */
export function makeNaamDeshBot(me: Profile, settings: NDSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: naamDeshBrain(speed), speed });
}
