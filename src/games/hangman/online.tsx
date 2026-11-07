import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import type { Profile } from '../../platform/net/rooms';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx, type Tx } from '../../components/sport/SportKit';
import { ScoreStrip } from '../bench-kit/BenchKit';
import { Gallows, partsFor } from './Gallows';
import { isShown, keyboard, livesLeft } from './model';
import { CATEGORIES } from './words';
import { GUESS_SECONDS, HMDuel, LIVES, ROUNDS, matchWinner, type DuelView, type HMSettings, type Prog } from './duel';
import { makeHangmanBot } from './bot';
import './hangman.css';

// Hangman online: a word duel. Three rounds; each round both players solve the same word at
// once on their own phones (see duel.ts). The other player's word shows as dots filling in
// (never the letters) and their chalk drawing grows with their misses.
// 15 seconds a guess: when the clock runs out it counts as one wrong guess.

const GAME = 'hangman';
const NEXT_SECONDS = 6;

function catLabel(x: Tx, id: string) {
  const c = CATEGORIES.find((k) => k.id === id);
  return c ? x.bi(c.name) : x.t('Mixed', 'মিশ্র');
}

function HMOptions({ value, onChange }: { value: HMSettings; onChange: (v: HMSettings) => void }) {
  const x = useTx();
  const { t } = x;
  return (
    <>
      <div className="opt-label">{t('Word language', 'শব্দের ভাষা')}</div>
      <Seg label={t('Word language', 'শব্দের ভাষা')} value={value.script} onChange={(v) => onChange({ ...value, script: v })} options={[{ v: 'bn', label: 'বাংলা' }, { v: 'en', label: 'English' }]} />
      <div className="opt-label">{t('Category', 'বিষয়')}</div>
      <Seg label={t('Category', 'বিষয়')} value={value.cat} onChange={(v) => onChange({ ...value, cat: v })} options={[{ v: 'any', label: t('Mixed', 'মিশ্র') }, ...CATEGORIES.map((c) => ({ v: c.id, label: x.bi(c.name) }))]} />
    </>
  );
}

export function OnlineHangman({ onBack, code }: { onBack: () => void; code?: string }) {
  const x = useTx();
  const { t, n } = x;
  const quick = useMemo<HMSettings>(() => ({ cat: 'any', script: x.lang === 'bn' ? 'bn' : 'en', lives: LIVES }), [x.lang]);
  return (
    <OnlineLobby<HMSettings>
      game={GAME}
      title={t('Hangman', 'হ্যাংম্যান')}
      onBack={onBack}
      code={code}
      defaultSettings={quick}
      quickSettings={quick}
      describe={(s) => `${catLabel(x, s.cat)} · ${s.script === 'bn' ? 'বাংলা' : 'English'} · ${t(`${ROUNDS} words`, `${n(ROUNDS)}টা শব্দ`)}`}
      Options={HMOptions}
      makeBot={(me: Profile, s, seed) => makeHangmanBot(me, s, seed)}
      Match={HMMatch}
      help={[
        t(`A word duel: ${ROUNDS} words, and you both get the same word at the same time.`, `শব্দের লড়াই: ${n(ROUNDS)}টা শব্দ, দুজনে একই সময়ে একই শব্দ পাবে।`),
        t('Solving beats not solving. If you both solve it, fewer wrong guesses wins, then the faster one.', 'যে শব্দ বাঁচায় সে জেতে। দুজনেই বাঁচালে যার ভুল কম সে জেতে, তারপর যে আগে পারে।'),
        t(`${GUESS_SECONDS} seconds for each guess; if time runs out, it counts as a wrong guess.`, `প্রতিটা আন্দাজের জন্য ${n(GUESS_SECONDS)} সেকেন্ড; সময় শেষ হলে একটা ভুল ধরা হবে।`),
      ]}
    />
  );
}

const secs = (x: Tx, ms: number) => x.t(`${(ms / 1000).toFixed(1)} s`, `${x.n((ms / 1000).toFixed(1))} সেকেন্ড`);

function progLine(x: Tx, p: Prog) {
  const { t, n } = x;
  if (p.status === 'won') return t(`Saved · ${p.wrong} wrong · ${(p.ms / 1000).toFixed(1)} s`, `বাঁচিয়েছে · ${n(p.wrong)}টা ভুল · ${secs(x, p.ms)}`);
  return t('Not saved', 'বাঁচাতে পারেনি');
}

function HMMatch({ peer, settings, seed, onLeave }: MatchProps<HMSettings>) {
  const x = useTx();
  const { t, n } = x;
  const duel = useMemo(() => new HMDuel(peer, peer.host ? 0 : 1, settings, seed), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<DuelView>(duel.view);
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const prevOpp = useRef<Prog | null>(null);
  useGameBar({ help: <p>{t('Both of you solve the same word. Fewer wrong guesses wins.', 'দুজনে একই শব্দ বের করো। যার ভুল কম সে জেতে।')}</p> }, [x.lang]);

  useEffect(() => {
    const off = duel.onChange(setV);
    duel.attach();
    setV(duel.view);
    (window as unknown as { __hmOnline?: HMDuel }).__hmOnline = duel;
    return () => { off(); duel.detach(); };
  }, [duel]);
  useRealUnmount(() => { duel.dispose(); peer.close(); delete (window as unknown as { __hmOnline?: HMDuel }).__hmOnline; });

  // A small sound when the other player finishes their word.
  useEffect(() => {
    const p = v.opp;
    if (p && p.status !== 'play' && prevOpp.current?.status === 'play') sfx(p.status === 'won' ? 'tick' : 'page');
    prevOpp.current = p;
  }, [v.opp]);

  const playing = v.phase === 'play' && !gone;
  const play = (l: string) => {
    const before = duel.view.st;
    if (!playing || !duel.guess(l)) return;
    const st = duel.view.st;
    if (st.guessed.length > before.guessed.length) sfx('good', { pitch: 1.1 }); else { sfx('bad'); vibrate(25); }
    if (st.status === 'won') sfx('fanfare'); else if (st.status === 'lost') sfx('out');
  };
  const left = useMoveClock(playing ? `${v.g}|${v.r}|${v.st.guessed.length + v.st.wrong.length}` : '', GUESS_SECONDS, () => {
    if (duel.timeout()) { sfx('bad'); vibrate(40); if (duel.view.st.status === 'lost') sfx('out'); }
  });

  // Between words: the next one opens by itself after a few seconds.
  const [nextLeft, setNextLeft] = useState(NEXT_SECONDS);
  useEffect(() => {
    if (v.phase !== 'between' || gone) return;
    const t0 = Date.now();
    setNextLeft(NEXT_SECONDS);
    const iv = window.setInterval(() => {
      const rest = NEXT_SECONDS - (Date.now() - t0) / 1000;
      setNextLeft(Math.max(0, rest));
      if (rest <= 0) { window.clearInterval(iv); duel.next(); }
    }, 200);
    return () => window.clearInterval(iv);
  }, [v.phase, v.r, v.g, gone]); // eslint-disable-line react-hooks/exhaustive-deps

  const rematch = useRematch(peer, () => duel.restart());

  useEffect(() => {
    if (v.phase !== 'over' || recorded.current === v.g) return;
    recorded.current = v.g;
    const w = matchWinner(v.tally);
    recordResult(GAME, { outcome: w === 0 ? 'tie' : w === 1 ? 'win' : 'loss' });
  }, [v.phase, v.g]); // eslint-disable-line react-hooks/exhaustive-deps

  // Physical keyboard for English letters.
  useEffect(() => {
    if (!playing || v.st.script !== 'en') return;
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); play(e.key.toUpperCase()); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const st = v.st;
  const opp = v.opp;
  const them = peer.them.name;
  const names = [peer.me.name, them];
  const keys = keyboard(st.script);
  const last = v.results[v.results.length - 1];
  const showLast = (v.phase === 'between' || v.phase === 'over') && last;
  const oppStatus = !opp || opp.status === 'play' ? (v.phase === 'between' ? t('Ready', 'প্রস্তুত') : t('Guessing…', 'আন্দাজ করছে…')) : opp.status === 'won' ? t('Saved it!', 'বাঁচিয়েছে!') : t('Out of chances', 'সুযোগ শেষ');
  const oppWrong = opp?.wrong ?? 0;
  const oppShown = new Set(opp?.shown ?? []);
  const w = matchWinner(v.tally);

  return (
    <div className="sport-page hmo" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={v.phase === 'over' ? '' : oppStatus} />
      <ScoreStrip names={names} scores={v.tally} n={n} />
      <div className="bench-round hmo-round">
        <span data-testid="round">{t('Word', 'শব্দ')} {n(v.r + 1)} / {n(ROUNDS)}</span>
        <span>{t('Clue', 'ইঙ্গিত')}: <b>{x.bi(v.word.cat.name)}</b></span>
      </div>

      <div className="hmo-opp hud-chalk" data-testid="opp-progress" aria-label={t(`${them}'s word`, `${them}-এর শব্দ`)}>
        <Gallows parts={partsFor(oppWrong, settings.lives, opp?.status === 'lost')} saved={opp?.status === 'won'} className="hmo-mini" />
        <div className="hmo-opp-main">
          <div className="hmo-dots" aria-hidden="true">
            {st.needs.map((need, i) => need.length === 0
              ? <span key={i} className="hmo-gap" />
              : <span key={i} className={`hmo-dot ${oppShown.has(i) ? 'on' : ''}`} />)}
          </div>
          <div className="hmo-opp-line">
            <span>{t('Misses', 'ভুল')}: <b data-testid="opp-misses">{n(oppWrong)}</b> / {n(settings.lives)}</span>
            <span className={`hmo-tag ${opp?.status ?? 'play'}`}>{opp?.status === 'won' ? t('Saved', 'বাঁচিয়েছে') : opp?.status === 'lost' ? t('Out', 'শেষ') : t('Solving', 'চলছে')}</span>
          </div>
        </div>
      </div>

      <div className="hm-layout hmo-layout">
        <div className="hm-board hud-chalk">
          <Gallows parts={partsFor(st.wrong.length, st.lives, st.status === 'lost')} saved={st.status === 'won'} />
          <div className="hmo-me">
            <div className="hm-lives" aria-live="polite">{t('Chances left', 'বাকি সুযোগ')}: <b data-testid="lives">{n(livesLeft(st))}</b></div>
            {playing && <MoveClock left={left} seconds={GUESS_SECONDS} />}
          </div>
        </div>
        <div className="hm-right">
          <div className={`hm-word ${st.script}`} data-testid="word" aria-label={t('Hidden word', 'লুকানো শব্দ')}>
            {st.clusters.map((c, i) => st.needs[i].length === 0
              ? <span key={i} className="hm-gap">{c === ' ' ? '' : c}</span>
              : <span key={i} className={`hm-slot ${isShown(st, i) ? 'on' : ''} ${st.status === 'lost' && !st.needs[i].every((l) => st.guessed.includes(l)) ? 'miss' : ''}`}>{isShown(st, i) ? c : ''}</span>)}
          </div>
          {v.phase === 'play' ? (
            <div className={`hm-keys ${st.script}`} role="group" aria-label={t('Letters', 'অক্ষর')}>
              {keys.map((k) => {
                const ok = st.guessed.includes(k), bad = st.wrong.includes(k);
                return <button key={k} className={`hm-key ${ok ? 'ok' : ''} ${bad ? 'bad' : ''}`} disabled={ok || bad || gone} onClick={() => play(k)} data-testid={`key-${k}`}>{k}</button>;
              })}
            </div>
          ) : v.phase === 'wait' ? (
            <div className="hm-end" data-testid="round-wait">
              <div className={`hm-stamp ${st.status}`}>{st.status === 'won' ? t('Saved!', 'বাঁচিয়েছ!') : t('Not this time', 'এবার হলো না')}</div>
              <p>{st.status === 'won' ? t(`${st.wrong.length} wrong`, `${n(st.wrong.length)}টা ভুল`) : ''}</p>
              <div className="ol-pulse"><i /><i /><i /> {t(`Waiting for ${them} to finish…`, `${them} শেষ করার অপেক্ষা…`)}</div>
            </div>
          ) : showLast ? (
            <div className="hm-end" data-testid="round-end">
              <div className={`hm-stamp ${last.win === 1 ? 'won' : last.win === -1 ? 'lost' : ''}`} data-testid="round-verdict">
                {last.win === 1 ? t('You win this word!', 'এই শব্দ তোমার!') : last.win === -1 ? t(`${them} wins this word`, `এই শব্দ ${them}-এর`) : t('This word is a draw', 'এই শব্দে ড্র')}
              </div>
              <p>{t(`The word was ${last.word}.`, `শব্দটা ছিল ${last.word}।`)}</p>
              <table className="hmo-table">
                <tbody>
                  <tr><th>{peer.me.name}</th><td>{progLine(x, last.me)}</td></tr>
                  <tr><th>{them}</th><td>{progLine(x, last.them)}</td></tr>
                </tbody>
              </table>
              {v.phase === 'between' && (
                <button className="btn big" onClick={() => duel.next()} data-testid="next-word">
                  {t('Next word', 'পরের শব্দ')} ({n(Math.ceil(nextLeft))})
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {(v.phase === 'over' || gone) && (
        <OnlineEnd
          title={w === 0 ? t('A draw!', 'ড্র!') : w === 1 ? t('You win!', 'তুমি জিতেছ!') : t(`${them} wins`, `${them} জিতেছে`)}
          lines={<>
            <p className="lede" data-testid="final-score">{names[0]} {n(v.tally[0])} · {names[1]} {n(v.tally[1])}</p>
            <ol className="hmo-sum">
              {v.results.map((r, i) => (
                <li key={i}><b>{r.word}</b> · {r.win === 1 ? peer.me.name : r.win === -1 ? them : t('draw', 'ড্র')}</li>
              ))}
            </ol>
          </>}
          gone={gone && v.phase !== 'over'} oppName={them}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
