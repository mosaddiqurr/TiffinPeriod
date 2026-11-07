import { useEffect, useMemo, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { DifficultySeg, ModeSeg, Seg, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BenchFrame, PassScreen, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { createRng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { unlockAchievement } from '../../platform/scores';
import { guess, hint, isShown, keyboard, livesLeft, newRound, roundPoints, validWord, type HMState, type Script } from './model';
import { CATEGORIES } from './words';
import './hangman.css';

const LIVES: Record<Difficulty, number> = { easy: 10, medium: 8, hard: 6 };
const PARTS = 11;
const SOLO_WORDS = 5;
const DUEL_ROUNDS = 4;

/** The chalk drawing. The head is a plain circle: no face. */
function Gallows({ parts, saved }: { parts: number; saved: boolean }) {
  const show = (i: number) => parts > i;
  return (
    <svg viewBox="0 0 200 220" className={`hm-gallows ${saved ? 'saved' : ''}`} aria-hidden="true">
      <g stroke="#f4f1e6" strokeWidth="5" strokeLinecap="round" fill="none">
        {show(0) && <path d="M20 205 H130" />}
        {show(1) && <path d="M50 205 V20" />}
        {show(2) && <path d="M50 20 H140" />}
        {show(3) && <path d="M50 55 L85 20" />}
        {show(4) && !saved && <path d="M140 20 V48" strokeWidth="3" />}
        <g className="hm-person">
          {show(5) && <circle cx="140" cy="66" r="18" />}
          {show(6) && <path d="M140 84 V140" />}
          {show(7) && <path d="M140 98 L114 122" />}
          {show(8) && <path d="M140 98 L166 122" />}
          {show(9) && <path d="M140 140 L118 178" />}
          {show(10) && <path d="M140 140 L162 178" />}
        </g>
      </g>
    </svg>
  );
}

export default function Hangman({ onExit }: GameProps) {
  const g = useBench('hangman'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [script, setScript] = useState<Script>(g.lang);
  const [cat, setCat] = useState('any');
  const rng = useMemo(() => createRng(), []);

  const [round, setRound] = useState(0);
  const [st, setSt] = useState<HMState | null>(null);
  const [catName, setCatName] = useState('');
  const [scores, setScores] = useState([0, 0]);
  const [step, setStep] = useState<'set' | 'pass' | 'guess' | 'end'>('guess');
  const [typed, setTyped] = useState('');
  const [typedCat, setTypedCat] = useState(CATEGORIES[0].id);
  const [used, setUsed] = useState<string[]>([]);
  const [clean, setClean] = useState(0);
  const names = mode === 'local2p' ? [p1, p2] : [g.u('you')];
  const lives = LIVES[diff];
  const guesser = mode === 'local2p' ? (round % 2 === 0 ? 1 : 0) : 0;
  const setter = guesser === 0 ? 1 : 0;

  const rules = [
    t('A word is hidden as blanks. Guess one letter at a time.', 'একটা শব্দ ফাঁকা ঘরে লুকানো। একবারে একটা অক্ষর আন্দাজ করো।'),
    t('A right letter fills its blanks. A wrong letter draws one more chalk line.', 'ঠিক অক্ষর ফাঁকা ঘর ভরায়। ভুল অক্ষরে চকে আরেকটা দাগ পড়ে।'),
    t('Save the word before the drawing is finished. A hint shows a letter but costs one chance.', 'ছবি শেষ হওয়ার আগে শব্দ বাঁচাও। ইঙ্গিত একটা অক্ষর দেখায়, তবে একটা সুযোগ কমে।'),
    t('Bangla: a vowel sign counts as its vowel (কি needs ক and ই). Joined letters need each letter.', 'বাংলায়: কার চিহ্ন তার স্বরবর্ণ ধরে (কি-তে লাগবে ক আর ই)। যুক্তাক্ষরে প্রতিটা অক্ষর লাগবে।'),
    t('With a friend: take turns to set a secret word for the other. Keyboard: type letters (English).', 'বন্ধুর সাথে: পালা করে অন্যজনের জন্য গোপন শব্দ দাও। কী-বোর্ডে অক্ষর টাইপ করো (ইংরেজি)।'),
  ];

  const pickWord = (avoid: string[]) => {
    const pool = cat === 'any' ? CATEGORIES : CATEGORIES.filter((c) => c.id === cat);
    for (let i = 0; i < 40; i++) {
      const c = rng.pick(pool);
      const w = rng.pick(c[script]);
      if (!avoid.includes(w)) return { c, w };
    }
    const c = pool[0];
    return { c, w: c[script][0] };
  };

  const begin = (r: number, used0: string[]) => {
    setRound(r);
    if (mode === 'local2p') { setStep('set'); setTyped(''); setSt(null); return; }
    const { c, w } = pickWord(used0);
    setUsed([...used0, w]);
    setCatName(g.lang === 'bn' ? c.name.bn : c.name.en);
    setSt(newRound(w, script, lives));
    setStep('guess');
  };

  function start() { setScores([0, 0]); setClean(0); setUsed([]); begin(0, []); g.start(); }

  const doGuess = (l: string) => {
    if (!st || st.status !== 'play' || g.paused || step !== 'guess') return;
    const n = guess(st, l);
    if (n === st) return;
    const hit = n.guessed.length > st.guessed.length;
    if (hit) sfx('good', { pitch: 1.1 }); else { sfx('bad'); vibrate(25); }
    setSt(n);
    if (n.status !== 'play') endRound(n);
  };

  const endRound = (n: HMState) => {
    const pts = roundPoints(n);
    if (n.status === 'won') { sfx('fanfare'); if (n.wrong.length === 0 && n.hints === 0) { unlockAchievement('hm-clean'); setClean((c) => c + 1); } }
    else sfx('out');
    setScores((s) => s.map((v, i) => (i === guesser ? v + pts : v)));
    setStep('end');
  };

  const nextRound = () => {
    const total = mode === 'local2p' ? DUEL_ROUNDS : SOLO_WORDS;
    if (round + 1 < total) { begin(round + 1, used); return; }
    const sc = scores;
    if (mode === 'local2p') {
      const w = sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1;
      g.finish({ title: w === null ? t('A draw!', 'ড্র!') : `${names[w]} ${t('wins!', 'জিতেছে!')}`, outcome: 'none', rows: [[names[0], sc[0]], [names[1], sc[1]]] });
    } else {
      g.finish({ title: t(`${sc[0]} points`, `${g.n(sc[0])} পয়েন্ট`), outcome: 'none', score: sc[0], rows: [[t('Words', 'শব্দ'), SOLO_WORDS], [t('Points', 'পয়েন্ট'), sc[0]], [t('Saved without a mistake', 'একটাও ভুল ছাড়া'), clean]] });
    }
  };

  // Physical keyboard for English letters.
  useEffect(() => {
    if (g.phase !== 'play' || step !== 'guess') return;
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (st?.script === 'en' && /^[a-z]$/i.test(e.key)) { e.preventDefault(); doGuess(e.key.toUpperCase()); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const used2 = st ? st.wrong.length + st.hints : 0;
  const parts = st ? (st.status === 'lost' ? PARTS : Math.min(PARTS, Math.ceil((used2 * PARTS) / st.lives))) : 0;
  const keys = keyboard(st?.script ?? script);
  const okTyped = validWord(typed, script);

  return (
    <BenchFrame game={g} title={t('Hangman', 'হ্যাংম্যান')} lede={t('Chalk on the blackboard while the teacher is out.', 'স্যার ক্লাসের বাইরে, ব্ল্যাকবোর্ডে চকের খেলা।')} rules={rules} onStart={start} onExit={onExit}
      art={<svg viewBox="0 0 110 88"><rect width="110" height="88" rx="6" fill="#24392d" /><g stroke="#f4f1e6" strokeWidth="3" fill="none" strokeLinecap="round"><path d="M14 78h44M26 78V12h40v10" /><circle cx="66" cy="30" r="8" /><path d="M66 38v20M66 44l-9 9M66 44l9 9" /></g><text x="88" y="72" fill="#f3b61f" fontSize="20" fontWeight="800" textAnchor="middle">অ</text></svg>}
      options={<>
        <ModeSeg value={mode} onChange={setMode} modes={['solo', 'local2p']} />
        <div className="opt-label">{t('Word language', 'শব্দের ভাষা')}</div>
        <Seg label={t('Word language', 'শব্দের ভাষা')} value={script} onChange={setScript} options={[{ v: 'bn', label: 'বাংলা' }, { v: 'en', label: 'English' }]} />
        {mode === 'solo' && <>
          <div className="opt-label">{t('Category', 'বিষয়')}</div>
          <Seg label={t('Category', 'বিষয়')} value={cat} onChange={setCat} options={[{ v: 'any', label: t('Any', 'যেকোনো') }, ...CATEGORIES.map((c) => ({ v: c.id, label: g.lang === 'bn' ? c.name.bn : c.name.en }))]} />
        </>}
        <DifficultySeg value={diff} onChange={setDiff} />
        <p className="bench-note">{t(`${LIVES[diff]} wrong guesses allowed.`, `${g.n(LIVES[diff])}টা ভুল চলবে।`)}</p>
      </>}
    >
      <ScoreStrip names={names} scores={scores} active={step === 'guess' ? guesser : undefined} n={g.n} />
      <div className="bench-round">{t('Word', 'শব্দ')} {g.n(round + 1)} / {g.n(mode === 'local2p' ? DUEL_ROUNDS : SOLO_WORDS)}{mode === 'local2p' && step !== 'set' ? ` · ${names[guesser]} ${t('is guessing', 'আন্দাজ করছে')}` : ''}</div>

      {step === 'set' && (
        <section className="bench-center hm-set" data-testid="set-word">
          <h2>{t(`${names[setter]}: write a secret word`, `${names[setter]}: একটা গোপন শব্দ লেখো`)}</h2>
          <p className="bench-note">{t(`${names[guesser]}, look away!`, `${names[guesser]}, অন্য দিকে তাকাও!`)} {script === 'bn' ? t('Use Bangla letters.', 'বাংলা অক্ষরে লেখো।') : t('Use English letters.', 'ইংরেজি অক্ষরে লেখো।')}</p>
          <input className="text-in hm-input" type="password" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={script === 'bn' ? 'যেমন: কাঁঠাল' : 'e.g. MANGO'} aria-label={t('Secret word', 'গোপন শব্দ')} data-testid="secret" lang={script} />
          <div className="opt-label">{t('Clue: category', 'ইঙ্গিত: বিষয়')}</div>
          <select className="text-in" value={typedCat} onChange={(e) => setTypedCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{g.lang === 'bn' ? c.name.bn : c.name.en}</option>)}</select>
          {typed && !okTyped && <p className="hm-warn">{t('Use 2–24 letters from the keyboard of this language.', 'এই ভাষার ২–২৪টা অক্ষর ব্যবহার করো।')}</p>}
          <div className="bench-actions">
            <button className="btn big" disabled={!okTyped} data-testid="set-ok" onClick={() => { const c = CATEGORIES.find((x) => x.id === typedCat)!; setCatName(g.lang === 'bn' ? c.name.bn : c.name.en); setSt(newRound(typed.trim(), script, lives)); setTyped(''); setStep('pass'); }}>{t('Hide it', 'লুকাও')}</button>
            <button className="btn secondary" onClick={() => { const { c, w } = pickWord(used); setCatName(g.lang === 'bn' ? c.name.bn : c.name.en); setUsed([...used, w]); setSt(newRound(w, script, lives)); setStep('pass'); }}>{t('Pick one for me', 'আমার হয়ে বেছে দাও')}</button>
          </div>
        </section>
      )}
      {step === 'pass' && <PassScreen game={g} name={names[guesser]} onReady={() => setStep('guess')} />}

      {(step === 'guess' || step === 'end') && st && (
        <div className="hm-layout">
          <div className="hm-board hud-chalk">
            <Gallows parts={parts} saved={st.status === 'won'} />
            <div className="hm-lives" aria-live="polite">{t('Chances left', 'বাকি সুযোগ')}: <b data-testid="lives">{g.n(livesLeft(st))}</b></div>
          </div>
          <div className="hm-right">
            <div className="hm-cat">{t('Clue', 'ইঙ্গিত')}: <b>{catName}</b></div>
            <div className={`hm-word ${st.script}`} data-testid="word" aria-label={t('Hidden word', 'লুকানো শব্দ')}>
              {st.clusters.map((c, i) => st.needs[i].length === 0
                ? <span key={i} className="hm-gap">{c === ' ' ? '' : c}</span>
                : <span key={i} className={`hm-slot ${isShown(st, i) ? 'on' : ''} ${st.status === 'lost' && !st.needs[i].every((l) => st.guessed.includes(l)) ? 'miss' : ''}`}>{isShown(st, i) ? c : ''}</span>)}
            </div>
            {step === 'end' ? (
              <div className="hm-end" data-testid="round-end">
                <div className={`hm-stamp ${st.status}`}>{st.status === 'won' ? t('Saved!', 'বাঁচিয়েছ!') : t('Not this time', 'এবার হলো না')}</div>
                <p>{st.status === 'won' ? t(`+${roundPoints(st)} points`, `+${g.n(roundPoints(st))} পয়েন্ট`) : t(`The word was ${st.word}.`, `শব্দটা ছিল ${st.word}।`)}</p>
                <button className="btn big" autoFocus onClick={nextRound} data-testid="next-word">{round + 1 < (mode === 'local2p' ? DUEL_ROUNDS : SOLO_WORDS) ? t('Next word', 'পরের শব্দ') : t('See the result', 'ফল দেখো')}</button>
              </div>
            ) : (
              <>
                <div className={`hm-keys ${st.script}`} role="group" aria-label={t('Letters', 'অক্ষর')}>
                  {keys.map((k) => {
                    const ok = st.guessed.includes(k), bad = st.wrong.includes(k);
                    return <button key={k} className={`hm-key ${ok ? 'ok' : ''} ${bad ? 'bad' : ''}`} disabled={ok || bad} onClick={() => doGuess(k)} data-testid={`key-${k}`}>{k}</button>;
                  })}
                </div>
                <div className="bench-actions"><button className="btn secondary" onClick={() => { const n = hint(st, (a) => rng.pick(a)); if (n !== st) { sfx('page'); setSt(n); if (n.status !== 'play') endRound(n); } }} disabled={livesLeft(st) <= 1} data-testid="hint">{t('Hint (costs a chance)', 'ইঙ্গিত (একটা সুযোগ কমবে)')}</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </BenchFrame>
  );
}
