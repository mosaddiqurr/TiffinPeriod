import type { Rng } from '../../engine/rng';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { keyboard, newRound, type HMState, type Script } from './model';
import { HMDuel, type HMSettings } from './duel';

// The quick-match stand-in for the word duel. It guesses like a person: common letters
// first (by how often they turn up in that language), and once some of the word shows,
// letters that fit words it knows from the clue's category. Now and then it slips and tries
// a random letter. It waits for the player to start each round and thinks 1–4 s a guess,
// so it never runs out its clock.

// Letters from most to least common in ordinary writing.
const EN_FREQ = 'EAIONRTSLCUDPMHGBYFVKWZXJQ'.split('');
const BN_FREQ = ['আ', 'এ', 'ই', 'র', 'ক', 'ন', 'ল', 'ব', 'ত', 'ম', 'স', 'উ', 'প', 'দ', 'য়', 'গ', 'জ', 'হ', 'ও', 'চ', 'শ', 'ট', 'ড়', 'ভ', 'খ', 'ঁ', 'ং', 'ধ', 'য', 'ঠ', 'ড', 'ফ', 'ছ', 'অ', 'ঘ', 'থ', 'ঈ', 'ণ', 'ষ', 'ঞ', 'ঙ', 'ঝ', 'ঊ', 'ৎ', 'ঋ', 'ঐ', 'ঔ', 'ঢ', 'ঢ়', 'ঃ'];

export function freqOrder(script: Script): string[] {
  const base = script === 'en' ? EN_FREQ : BN_FREQ;
  const keys = keyboard(script);
  return [...base.filter((l) => keys.includes(l)), ...keys.filter((l) => !base.includes(l))];
}

/** Words from `known` that still fit what this board shows. */
export function fitting(st: HMState, known: string[]): HMState[] {
  const out: HMState[] = [];
  for (const w of known) {
    const c = newRound(w, st.script, st.lives);
    if (c.clusters.length !== st.clusters.length) continue;
    let ok = true;
    for (let i = 0; i < c.clusters.length && ok; i++) {
      const shown = st.needs[i].length > 0 && st.needs[i].every((l) => st.guessed.includes(l));
      if ((st.needs[i].length === 0) !== (c.needs[i].length === 0)) ok = false;
      else if (st.needs[i].length === 0) ok = st.clusters[i] === c.clusters[i];
      else if (shown) ok = c.clusters[i] === st.clusters[i];
      else ok = !c.needs[i].every((l) => st.guessed.includes(l));
      if (ok && c.needs[i].some((l) => st.wrong.includes(l))) ok = false;
    }
    if (ok) out.push(c);
  }
  return out;
}

/** The stand-in's next letter. `skill` 0–1: how often it uses what the board shows. */
export function botLetter(st: HMState, rng: Rng, skill: number, known: string[]): string {
  const used = new Set([...st.guessed, ...st.wrong]);
  const free = freqOrder(st.script).filter((l) => !used.has(l));
  if (!free.length) return '';
  const total = st.needs.filter((n) => n.length).length || 1;
  const seen = st.needs.filter((n) => n.length && n.every((l) => st.guessed.includes(l))).length / total;
  // A slip: any letter at all.
  if (rng.chance(0.07)) return rng.pick(free);
  if (rng.chance(skill * (0.25 + 0.75 * seen))) {
    const fits = fitting(st, known);
    if (fits.length) {
      const count = new Map<string, number>();
      for (const c of fits) for (const l of new Set(c.needs.flat())) if (!used.has(l)) count.set(l, (count.get(l) ?? 0) + 1);
      const best = [...count.entries()].sort((a, b) => b[1] - a[1]);
      if (best.length) return best[0][0];
    }
  }
  // Common letters first, not always in exactly the same order.
  return free[Math.min(free.length - 1, rng.chance(0.6) ? 0 : rng.int(1, 3))];
}

export function hangmanBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: HMSettings; seed: number }) => {
    const rng = ctx.rng;
    const duel = new HMDuel(end, 0, ctx.settings, ctx.seed);
    const skill = rng.range(0.45, 0.85);
    const pace = rng.range(0.8, 1.25);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let going = false;
    let closed = false;
    let asked = false;
    const known = () => duel.view.word.cat[ctx.settings.script];
    const plan = (first = false) => {
      clearTimeout(timer);
      if (closed || !going || duel.view.phase !== 'play') return;
      timer = setTimeout(() => {
        if (closed || !going || duel.view.phase !== 'play') return;
        const l = botLetter(duel.view.st, rng, skill, known());
        if (l) duel.guess(l); else duel.timeout();
        plan();
      }, thinkMs(rng, (first ? 2 : 1.1) * pace, (first ? 4.5 : 3.8) * pace, speed));
    };
    const offs = [
      end.on('start', (d: { g: number; r: number }) => {
        if (closed || d.g !== duel.view.g) return;
        if (d.r === duel.view.r + 1 && duel.view.phase === 'between') duel.next();
        if (d.r === duel.view.r && duel.view.phase === 'play' && !going) { duel.startClock(); going = true; plan(true); }
      }),
      end.on('rematch', () => {
        if (asked || closed) return;
        asked = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
          asked = false;
          going = false;
          end.send('rematch');
          duel.restart();
        }, thinkMs(rng, 1, 2.4, speed));
      }),
    ];
    duel.onChange((v) => { if (v.phase === 'between' || v.phase === 'over') going = false; });
    duel.attach();
    return () => { closed = true; clearTimeout(timer); offs.forEach((f) => f()); duel.dispose(); };
  };
}

/** `speed` > 1 makes it think faster (tests only). */
export function makeHangmanBot(me: Profile, settings: HMSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: hangmanBrain(speed), speed });
}
