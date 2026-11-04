import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { ballsLeft, currentOver, oversText } from '../../shared/cricket';
import { ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Mode } from '../../components/ui';
import { Book, type BookState } from './Book';
import {
  DIGITS, LINEUPS, OUTCOME_CHOICES, PRESETS, battingSide, expectedRunsPerBall, isPlayable, lastDigit, limitsOf, newMatch, other,
  pickPage, playPage, sameOutcome, strikerIndex, targetOf, type BCState, type Digit, type Outcome, type RuleSet, type Side,
} from './logic';
import './book-cricket.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'rules' | 'custom' | 'customHelp' | 'needOut' | 'avg'
  | 'wickets' | 'overs' | 'noLimit' | 'batFirst' | 'me' | 'opp' | 'hold' | 'holdKey' | 'aiFlipping' | 'turn'
  | 'out' | 'runs' | 'dot' | 'nb' | 'page' | 'digit' | 'card' | 'target' | 'need' | 'breakTitle' | 'breakText' | 'chase'
  | 'wonRuns' | 'wonWkts' | 'tied' | 'top' | 'inn' | 'notOut' | 'over' | 'legend'
> = {
  en: {
    title: 'Book Cricket', lede: 'Every school bag had one: the book that became a cricket match.',
    r1: 'Hold the book to riffle the pages. Let go to open it.',
    r2: 'Look at the last digit of the LEFT page number.',
    r3: 'The digit gives the result of the ball. 0 means OUT.',
    r4: 'One batter bats at a time. When all wickets fall, the innings ends.',
    rules: 'Scoring rules', custom: 'My own rules', customHelp: 'Choose what each last digit means.', needOut: 'At least one digit must be OUT.',
    avg: 'About {r} runs per ball', wickets: 'Wickets (batters per side)', overs: 'Overs', noLimit: 'No limit',
    batFirst: 'Who bats first?', me: '{name}', opp: '{name}',
    hold: 'Hold, then let go', holdKey: 'or hold Space', aiFlipping: 'The computer is opening the book…', turn: '{name} is batting',
    out: 'OUT!', runs: '{n} runs', dot: 'Dot ball', nb: 'No-ball +1', page: 'Page {p}', digit: 'Last digit {d}',
    card: 'Scorecard', target: 'Target {n}', need: 'Need {r}', breakTitle: 'Innings break', breakText: '{name} made {r}/{w}. Target: {t}.', chase: 'Start the chase',
    wonRuns: '{name} won by {m} runs', wonWkts: '{name} won by {m} wickets', tied: 'Match tied!', top: 'Top scorer — {name}', inn: 'Innings — {name}',
    notOut: 'not out', over: 'Over {o}', legend: 'Last digit:',
  },
  bn: {
    title: 'বই ক্রিকেট', lede: 'সবার ব্যাগেই একটা বই ছিল, যেটা টিফিনে ক্রিকেট মাঠ হয়ে যেত।',
    r1: 'বইটা ধরে রাখো, পাতা উল্টাতে থাকবে। ছেড়ে দিলে বই খুলবে।',
    r2: 'বাঁ পাশের পাতার নম্বরের শেষ অঙ্কটা দেখো।',
    r3: 'ওই অঙ্কেই বলের ফল। ০ মানে আউট!',
    r4: 'একবারে একজন ব্যাট করে। সব উইকেট পড়লে ইনিংস শেষ।',
    rules: 'রানের নিয়ম', custom: 'নিজের নিয়ম', customHelp: 'প্রতিটা শেষ অঙ্কের মানে ঠিক করো।', needOut: 'অন্তত একটা অঙ্ক আউট হতে হবে।',
    avg: 'প্রতি বলে গড়ে প্রায় {r} রান', wickets: 'উইকেট (প্রতি দলের ব্যাটার)', overs: 'ওভার', noLimit: 'সীমা নেই',
    batFirst: 'আগে কে ব্যাট করবে?', me: '{name}', opp: '{name}',
    hold: 'ধরে রাখো, তারপর ছাড়ো', holdKey: 'বা স্পেস চেপে ধরো', aiFlipping: 'কম্পিউটার বই খুলছে…', turn: '{name} ব্যাট করছে',
    out: 'আউট!', runs: '{n} রান', dot: 'ডট বল', nb: 'নো-বল +১', page: 'পৃষ্ঠা {p}', digit: 'শেষ অঙ্ক {d}',
    card: 'স্কোরকার্ড', target: 'লক্ষ্য {n}', need: 'লাগবে {r}', breakTitle: 'ইনিংস বিরতি', breakText: '{name} করেছে {r}/{w}। লক্ষ্য: {t}।', chase: 'তাড়া শুরু করো',
    wonRuns: '{name} {m} রানে জিতেছে', wonWkts: '{name} {m} উইকেটে জিতেছে', tied: 'ম্যাচ টাই!', top: 'সর্বোচ্চ রান — {name}', inn: 'ইনিংস — {name}',
    notOut: 'নট আউট', over: 'ওভার {o}', legend: 'শেষ অঙ্ক:',
  },
};

type Phase = 'setup' | 'play' | 'break' | 'result';

export default function BookCricket({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [wickets, setWickets] = useState(3);
  const [overs, setOvers] = useState<number | null>(3);
  const [ruleId, setRuleId] = useState<string>('classic');
  const [custom, setCustom] = useState<RuleSet>({ id: 'custom', name: { bn: 'নিজের নিয়ম', en: 'My own rules' }, map: { ...PRESETS[0].map } });
  const [firstBat, setFirstBat] = useState<Side>(0);

  const [phase, setPhase] = useState<Phase>('setup');
  const [paused, setPaused] = useState(false);
  const [match, setMatch] = useState<BCState | null>(null);
  const [book, setBook] = useState<BookState>('closed');
  const [page, setPage] = useState(46);
  const [showDigit, setShowDigit] = useState(false);
  const [stamp, setStamp] = useState<{ text: string; kind: string } | null>(null);
  const [holding, setHolding] = useState(false);
  const [best, setBest] = useState(false);

  const rng = useMemo(() => createRng(), []);
  const holdStart = useRef(0);
  const riffleTimer = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (riffleTimer.current) clearInterval(riffleTimer.current); }, []);

  const vsAI = mode === 'ai';
  const names: [string, string] = vsAI ? [u('you'), u('computer')] : [n1, n2];
  const rules = ruleId === 'custom' ? custom : PRESETS.find((p) => p.id === ruleId)!;
  const lineups = LINEUPS[t.lang];

  const busy = book === 'riffle' || !!stamp;
  const batSide = match ? battingSide(match) : 0;
  const aiTurn = vsAI && batSide === 1 && phase === 'play';

  const restart = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPaused(false);
    setMatch(newMatch({ wickets, overs, rules }, firstBat, lineups));
    setBook('closed');
    setStamp(null);
    setShowDigit(false);
    setBest(false);
    setPhase('play');
    sfx('bell');
  }, [wickets, overs, rules, firstBat, lineups]);

  useGameBar({ onPause: phase === 'play' || phase === 'break' ? () => { setHolding(false); setPaused(true); } : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  const describe = (o: Outcome) => o.kind === 'out' ? t('out') : o.kind === 'nb' ? t('nb') : o.runs === 0 ? t('dot') : t('runs', { n: o.runs });

  // ---- Riffle and open ----
  // Refs keep the latest values for timers and key handlers.
  const matchRef = useRef<BCState | null>(null);
  matchRef.current = match;
  const riffling = useRef(false);

  const beginRiffle = () => {
    const m = matchRef.current;
    if (!m || m.done || riffling.current || stamp || paused || phase !== 'play') return false;
    riffling.current = true;
    setBook('riffle');
    setShowDigit(false);
    holdStart.current = performance.now();
    sfx('page');
    let k = 0;
    riffleTimer.current = window.setInterval(() => {
      k++;
      setPage(10 + 2 * ((k * 37) % 95));
      sfx('riffle', { gain: 0.6 });
    }, 110);
    return true;
  };

  const openBook = () => {
    if (riffleTimer.current) { clearInterval(riffleTimer.current); riffleTimer.current = null; }
    const m = matchRef.current;
    if (!m) return;
    const p = pickPage(rng); // the page is chance, as in the real game
    const o = m.config.rules.map[lastDigit(p)];
    const m2 = playPage(m, p);
    setPage(p);
    setBook('open');
    sfx('page', { pitch: 0.8 });
    setMatch(m2);
    later(() => {
      setShowDigit(true);
      setStamp({ text: describe(o), kind: o.kind === 'out' ? 'out' : o.kind === 'runs' && o.runs === 6 ? 'six' : 'runs' });
      if (o.kind === 'out') { sfx('out'); vibrate([30, 40, 60]); }
      else if (o.kind === 'runs' && o.runs === 6) sfx('six');
      else sfx('good', { pitch: o.kind === 'runs' ? 0.8 + o.runs * 0.08 : 1 });
    }, 250);
    later(() => {
      setStamp(null);
      riffling.current = false;
      if (m2.done) finish(m2);
      else if (m2.current !== m.current) { setPhase('break'); sfx('whistle'); setBook('closed'); }
    }, o.kind === 'out' ? 1500 : 1150);
  };

  const endHold = () => {
    if (!riffleTimer.current) return; // not riffling
    const held = performance.now() - holdStart.current;
    const wait = Math.max(0, 450 - held); // a quick tap still riffles for a short moment
    later(openBook, wait);
  };

  // Human input: pointer hold on the button or the book, or the Space key.
  const down = () => { if (aiTurn) return; if (beginRiffle()) setHolding(true); };
  const up = () => { if (!holding) return; setHolding(false); endHold(); };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); down(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); up(); } };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  });

  // Computer turn: it riffles for a random time and lets go.
  useEffect(() => {
    if (!aiTurn || busy || paused || !match || match.done) return;
    const id = window.setTimeout(() => {
      if (beginRiffle()) later(openBook, 500 + rng.int(0, 600));
    }, 650);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTurn, busy, paused, match]);

  const finish = (m: BCState) => {
    setPhase('result');
    const r = m.result!;
    const humanInn = m.battingFirst === 0 ? 0 : 1;
    const outcome = !vsAI ? 'none' : r.winnerSide === null ? 'tie' : r.winnerSide === 0 ? 'win' : 'loss';
    const res = recordResult('book-cricket', { outcome, score: vsAI ? m.innings[humanInn].runs : undefined }, (_s, rr) => {
      const ids: string[] = [];
      const cards = vsAI ? [m.cards[humanInn]] : m.cards;
      if (cards.some((c) => c.some((b) => b.runs >= 50))) ids.push('bc-fifty');
      if (rr.outcome === 'win') ids.push('bc-win');
      return ids;
    });
    setBest(vsAI && res.newBest);
  };

  // ---------- Setup ----------
  if (phase === 'setup') {
    const playable = isPlayable(rules);
    return (
      <div className="bc-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <Rules t={t} />
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            <div className="opt-label">{t('rules')}</div>
            <Seg label={t('rules')} value={ruleId} onChange={setRuleId} options={[...PRESETS.map((p) => ({ v: p.id, label: t.bi(p.name) })), { v: 'custom', label: t('custom') }]} />
            {ruleId === 'custom' && (
              <div className="bc-custom">
                <small>{t('customHelp')}</small>
                {DIGITS.map((d) => (
                  <label key={d} className="bc-custom-row">
                    <span className="d">{t.n(d)}</span>
                    <select value={OUTCOME_CHOICES.findIndex((o) => sameOutcome(o, custom.map[d]))} onChange={(e) => setCustom((c) => ({ ...c, map: { ...c.map, [d]: OUTCOME_CHOICES[Number(e.target.value)] } }))}>
                      {OUTCOME_CHOICES.map((o, i) => <option key={i} value={i}>{describe(o)}</option>)}
                    </select>
                  </label>
                ))}
                {!playable && <p style={{ color: 'var(--pen-red)', fontWeight: 600 }}>{t('needOut')}</p>}
              </div>
            )}
            <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 14 }}>{t('avg', { r: expectedRunsPerBall(rules).toFixed(1) })}</p>
            <div className="opt-label">{t('wickets')}</div>
            <Seg label={t('wickets')} value={wickets} onChange={setWickets} options={[1, 3, 5, 10].map((v) => ({ v, label: t.n(v) }))} />
            <div className="opt-label">{t('overs')}</div>
            <Seg label={t('overs')} value={overs ?? 0} onChange={(v) => setOvers(v === 0 ? null : v)} options={[...[1, 3, 5].map((v) => ({ v, label: t.n(v) })), { v: 0, label: t('noLimit') }]} />
            <div className="opt-label">{t('batFirst')}</div>
            <Seg label={t('batFirst')} value={firstBat} onChange={setFirstBat} options={[{ v: 0 as Side, label: names[0] }, { v: 1 as Side, label: names[1] }]} />
            <div className="actions"><button className="btn big" disabled={!playable} onClick={restart} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const m = match!;
  const inn = m.innings[m.current];
  const lim = limitsOf(m.config);
  const tg = targetOf(m);
  const left = ballsLeft(inn, lim);
  const card = m.cards[m.current];
  const si = Math.min(strikerIndex(m), card.length - 1);
  const over = currentOver(inn.events);

  return (
    <div className="bc-root">
      <div className="bc-layout">
        <div className="hud-chalk bc-board" aria-live="polite">
          <div className="bc-board-row"><span>{t('turn', { name: names[batSide] })}</span><b data-testid="score">{t.n(inn.runs)}/{t.n(inn.wickets)}</b></div>
          <div className="bc-board-row small">
            {lim.balls !== null && <span>{t('over', { o: t.n(oversText(inn.balls)) })} / {t.n(m.config.overs!)}</span>}
            {tg !== undefined && <span>{t('target', { n: tg })}</span>}
            {tg !== undefined && <span className="need">{t('need', { r: Math.max(0, tg - inn.runs) })}{left !== null ? ` · ${t.n(left)}` : ''}</span>}
          </div>
          <div className="bc-over">{over.map((e, i) => <span key={i} className={`ball ${e.out ? 'w' : e.extra ? 'nb' : e.runs === 6 ? 's' : ''}`}>{e.out ? 'W' : e.extra ? 'nb' : t.n(e.runs)}</span>)}</div>
        </div>

        <div
          className={`bc-book-wrap ${aiTurn ? 'ai' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); down(); }}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          data-testid="book"
        >
          <Book state={book} page={page} owner={card[si]?.name ?? ''} numFmt={(n) => t.n(n)} highlight={showDigit} />
          {stamp && <div className={`bc-stamp ${stamp.kind}`} data-testid="stamp">{stamp.text}</div>}
          {showDigit && m.lastPage !== null && book === 'open' && (
            <div className="bc-explain">{t('page', { p: m.lastPage })} → {t('digit', { d: lastDigit(m.lastPage) })}</div>
          )}
        </div>

        <aside className="bc-card">
          <h3>{t('card')} — {names[batSide]}</h3>
          <ol>
            {card.map((b, i) => (
              <li key={i} className={`${b.out ? 'out' : ''} ${i === si && !b.out ? 'now' : ''}`}>
                <span className="nm">{b.name}</span>
                <span className="sc">{b.balls || b.out || i === si ? `${t.n(b.runs)} (${t.n(b.balls)})` : '—'}</span>
                <span className="st">{b.out ? t('out').replace('!', '') : i === si ? '•' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="bc-legend">
            {t('legend')} {DIGITS.map((d) => <span key={d} className="chip">{t.n(d)} = {describe(m.config.rules.map[d as Digit]).replace('!', '')}</span>)}
          </div>
        </aside>

        <div className="bc-controls">
          {aiTurn ? (
            <div className="bc-ai-note">{t('aiFlipping')}</div>
          ) : (
            <button
              className={`btn big bc-hold ${holding ? 'down' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); down(); }}
              onPointerUp={up}
              onPointerLeave={up}
              onPointerCancel={up}
              disabled={busy && !holding}
              data-testid="hold"
            >
              {t('hold')} <span className="key-hint hide-touch">{t('holdKey')}</span>
            </button>
          )}
        </div>
      </div>

      {phase === 'break' && !paused && (
        <Overlay label={t('breakTitle')}>
          <div className="sheet ruled">
            <h2>{t('breakTitle')}</h2>
            <p className="lede">{t('breakText', { name: names[m.battingFirst], r: m.innings[0].runs, w: m.innings[0].wickets, t: m.innings[0].runs + 1 })}</p>
            <div className="actions"><button className="btn big" onClick={() => { setPhase('play'); sfx('bell'); }} data-testid="chase" autoFocus>{t('chase')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={restart} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && m.result && (
        <ReportCard
          outcome={vsAI ? (m.result.winnerSide === null ? 'tie' : m.result.winnerSide === 0 ? 'win' : 'loss') : m.result.winnerSide === null ? 'tie' : 'none'}
          title={m.result.winnerSide === null ? t('tied') : m.result.kind === 'runs' ? t('wonRuns', { name: names[m.result.winnerSide], m: m.result.margin }) : t('wonWkts', { name: names[m.result.winnerSide], m: m.result.margin })}
          rows={[
            [t('inn', { name: names[m.battingFirst] }), `${t.n(m.innings[0].runs)}/${t.n(m.innings[0].wickets)} (${t.n(oversText(m.innings[0].balls))})`],
            [t('inn', { name: names[other(m.battingFirst)] }), `${t.n(m.innings[1].runs)}/${t.n(m.innings[1].wickets)} (${t.n(oversText(m.innings[1].balls))})`],
            ...([0, 1] as const).map((i) => {
              const top = [...m.cards[i]].sort((a, b) => b.runs - a.runs)[0];
              const side = i === 0 ? m.battingFirst : other(m.battingFirst);
              return [t('top', { name: names[side] }), top ? `${top.name} ${t.n(top.runs)}${top.out ? '' : '*'}` : '—'] as [string, string];
            }),
          ]}
          newBest={best}
          onAgain={restart}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      )}
    </div>
  );
}

function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4'>> }) {
  return <ol><li>{t('r1')}</li><li>{t('r2')}</li><li><b>{t('r3')}</b></li><li>{t('r4')}</li></ol>;
}
