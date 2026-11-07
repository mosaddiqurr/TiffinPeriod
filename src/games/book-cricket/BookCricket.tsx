import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { sfx, vibrate } from '../../platform/audio';
import { createRng } from '../../engine/rng';
import { ballsLeft, currentOver, oversText } from '../../shared/cricket';
import { getTeam, lineup } from '../../shared/teams';
import { Overlay, PauseMenu, Seg, useGameBar } from '../../components/ui';
import { CricketHub, type CricketAdapter, type CricketMatchProps } from '../../components/sport/CricketHub';
import { ChaseHud, CoinToss, Flag, useTx } from '../../components/sport/SportKit';
import { Book, type BookState } from './Book';
import {
  DIGITS, OUTCOME_CHOICES, PRESETS, battingSide, expectedRunsPerBall, isPlayable, lastDigit, limitsOf, newChase, newMatch, other,
  pickPage, playPage, sameOutcome, strikerIndex, targetOf, type BCConfig, type BCState, type Digit, type Outcome, type RuleSet,
} from './logic';
import './book-cricket.css';

// Book Cricket: riffle the book, the last digit of the left page decides the ball.
// The rules are unchanged; the hub adds countries and the four modes.

const rulesList = (t: (en: string, bn: string) => string) => [
  t('Hold the book to riffle the pages. Let go to open it.', 'বইটা ধরে রাখো, পাতা উল্টাতে থাকবে। ছেড়ে দিলে বই খুলবে।'),
  t('Look at the last digit of the LEFT page number.', 'বাঁ পাশের পাতার নম্বরের শেষ অঙ্কটা দেখো।'),
  t('The digit gives the result of the ball. 0 means OUT.', 'ওই অঙ্কেই বলের ফল। ০ মানে আউট!'),
  t('One batter bats at a time. When all wickets fall, the innings ends.', 'একবারে একজন ব্যাট করে। সব উইকেট পড়লে ইনিংস শেষ।'),
  t('The page is pure luck, just like the real book. Keyboard: hold Space.', 'পাতা পুরোপুরি ভাগ্য, আসল বইয়ের মতোই। কী-বোর্ডে স্পেস চেপে ধরো।'),
];

function rulesOf(extra: Record<string, string | number>): RuleSet {
  if (extra.rules === 'custom' && typeof extra.custom === 'string') {
    try { return { id: 'custom', name: { bn: 'নিজের নিয়ম', en: 'My own rules' }, map: JSON.parse(extra.custom) }; } catch { /* fall through */ }
  }
  return PRESETS.find((p) => p.id === extra.rules) ?? PRESETS[0];
}

function describe(o: Outcome, t: (en: string, bn: string) => string, n: (v: number) => string) {
  return o.kind === 'out' ? t('OUT!', 'আউট!') : o.kind === 'nb' ? t('No-ball +1', 'নো-বল +১') : o.runs === 0 ? t('Dot ball', 'ডট বল') : t(`${o.runs} ${o.runs === 1 ? 'run' : 'runs'}`, `${n(o.runs)} রান`);
}

function BookOptions({ value, onChange }: { value: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void }) {
  const { t, n, bi } = useTx();
  const ruleId = String(value.rules ?? 'classic');
  const custom: Record<Digit, Outcome> = typeof value.custom === 'string' ? JSON.parse(value.custom) : { ...PRESETS[0].map };
  const rules = rulesOf(value);
  const playable = isPlayable(rules);
  return (
    <>
      <div className="opt-label">{t('Scoring rules', 'রানের নিয়ম')}</div>
      <Seg label={t('Scoring rules', 'রানের নিয়ম')} value={ruleId} onChange={(v) => onChange({ ...value, rules: v, custom: value.custom ?? JSON.stringify(custom) })}
        options={[...PRESETS.map((p) => ({ v: p.id, label: bi(p.name) })), { v: 'custom', label: t('My own rules', 'নিজের নিয়ম') }]} />
      {ruleId === 'custom' && (
        <div className="bc-custom">
          <small>{t('Choose what each last digit means.', 'প্রতিটা শেষ অঙ্কের মানে ঠিক করো।')}</small>
          {DIGITS.map((d) => (
            <label key={d} className="bc-custom-row">
              <span className="d">{n(d)}</span>
              <select value={OUTCOME_CHOICES.findIndex((o) => sameOutcome(o, custom[d]))} onChange={(e) => onChange({ ...value, custom: JSON.stringify({ ...custom, [d]: OUTCOME_CHOICES[Number(e.target.value)] }) })}>
                {OUTCOME_CHOICES.map((o, i) => <option key={i} value={i}>{describe(o, t, n)}</option>)}
              </select>
            </label>
          ))}
          {!playable && <p style={{ color: 'var(--pen-red)', fontWeight: 600 }}>{t('At least one digit must be OUT. Classic rules will be used.', 'অন্তত একটা অঙ্ক আউট হতে হবে। নইলে ক্লাসিক নিয়মে খেলা হবে।')}</p>}
        </div>
      )}
      <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 14 }}>{t(`About ${expectedRunsPerBall(rules).toFixed(1)} runs per ball`, `প্রতি বলে গড়ে প্রায় ${n(expectedRunsPerBall(rules).toFixed(1))} রান`)}</p>
    </>
  );
}

type Phase = 'toss' | 'play' | 'break' | 'over';

function BookMatch({ spec, onDone, onQuit, onRestart }: CricketMatchProps) {
  const x = useTx();
  const { t, n } = x;
  const vsAI = spec.vsAI;
  const names = spec.names;
  const chosen = rulesOf(spec.extra);
  const rules = isPlayable(chosen) ? chosen : PRESETS[0];
  const config: BCConfig = spec.chase ? { wickets: spec.chase.wickets, overs: null, balls: spec.chase.balls, rules } : { wickets: spec.wickets, overs: spec.overs, rules };
  const lineups: [string[], string[]] = [lineup(getTeam(spec.teams[0]), x.lang), lineup(getTeam(spec.teams[1]), x.lang)];

  const [phase, setPhase] = useState<Phase>(spec.chase || spec.start !== 'toss' ? 'play' : 'toss');
  const [match, setMatch] = useState<BCState>(() => spec.chase ? newChase(config, spec.chase.target, lineups) : newMatch(config, spec.start === 'bowl' ? 1 : 0, lineups));
  const [paused, setPaused] = useState(false);
  const [book, setBook] = useState<BookState>('closed');
  const [page, setPage] = useState(46);
  const [showDigit, setShowDigit] = useState(false);
  const [stamp, setStamp] = useState<{ text: string; kind: string } | null>(null);
  const [holding, setHolding] = useState(false);

  const rng = useMemo(() => createRng(), []);
  const holdStart = useRef(0);
  const riffleTimer = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (riffleTimer.current) clearInterval(riffleTimer.current); }, []);

  const busy = book === 'riffle' || !!stamp;
  const batSide = battingSide(match);
  const aiTurn = vsAI && batSide === 1 && phase === 'play';
  const help = <ol>{rulesList(t).map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ onPause: phase !== 'over' ? () => { setHolding(false); setPaused(true); } : undefined, onResume: () => setPaused(false), help }, [phase, x.lang]);

  const matchRef = useRef(match);
  matchRef.current = match;
  const riffling = useRef(false);

  const beginRiffle = () => {
    const m = matchRef.current;
    if (m.done || riffling.current || stamp || paused || phase !== 'play') return false;
    riffling.current = true;
    setBook('riffle'); setShowDigit(false);
    holdStart.current = performance.now();
    sfx('page');
    let k = 0;
    riffleTimer.current = window.setInterval(() => { k++; setPage(10 + 2 * ((k * 37) % 95)); sfx('riffle', { gain: 0.6 }); }, 110);
    return true;
  };

  const finish = (m: BCState) => {
    setPhase('over');
    const rows: Array<[string, string | number]> = ([0, 1] as const).filter((i) => !(spec.chase && i === 0)).map((i) => {
      const top = [...m.cards[i]].sort((a, b) => b.runs - a.runs)[0];
      const side = i === 0 ? m.battingFirst : other(m.battingFirst);
      return [t(`Top scorer — ${names[side]}`, `সর্বোচ্চ রান — ${names[side]}`), top ? `${top.name} ${n(top.runs)}${top.out ? '' : '*'}` : '—'] as [string, string];
    });
    const human = m.battingFirst === 0 ? 0 : 1;
    const topScore = Math.max(...m.cards[human].map((b) => b.runs), 0);
    later(() => onDone({ battingFirst: m.battingFirst, innings: m.innings, result: m.result!, rows, topScore }), 500);
  };

  const openBook = () => {
    if (riffleTimer.current) { clearInterval(riffleTimer.current); riffleTimer.current = null; }
    const m = matchRef.current;
    const p = pickPage(rng);
    const o = m.config.rules.map[lastDigit(p)];
    const m2 = playPage(m, p);
    setPage(p); setBook('open'); sfx('page', { pitch: 0.8 });
    setMatch(m2);
    later(() => {
      setShowDigit(true);
      setStamp({ text: describe(o, t, n), kind: o.kind === 'out' ? 'out' : o.kind === 'runs' && o.runs === 6 ? 'six' : 'runs' });
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
    if (!riffleTimer.current) return;
    const held = performance.now() - holdStart.current;
    later(openBook, Math.max(0, 450 - held));
  };
  const down = () => { if (aiTurn) return; if (beginRiffle()) setHolding(true); };
  const up = () => { if (!holding) return; setHolding(false); endHold(); };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); down(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); up(); } };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  });

  useEffect(() => {
    if (!aiTurn || busy || paused || match.done) return;
    const id = window.setTimeout(() => { if (beginRiffle()) later(openBook, 500 + rng.int(0, 600)); }, 650);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTurn, busy, paused, match]);

  const m = match;
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
          <div className="bc-board-row"><span><Flag id={spec.teams[batSide]} size={24} /> {t(`${names[batSide]} batting`, `${names[batSide]} ব্যাট করছে`)}</span><b data-testid="score">{n(inn.runs)}/{n(inn.wickets)}</b></div>
          <div className="bc-board-row small">
            {spec.occasion && <span>{spec.occasion}</span>}
            {lim.balls !== null && <span>{t('Over', 'ওভার')} {n(oversText(inn.balls))}{m.config.overs ? ` / ${n(m.config.overs)}` : ''}</span>}
            {tg !== undefined && left === null && <span className="need">{t(`Need ${Math.max(0, tg - inn.runs)}`, `লাগবে ${n(Math.max(0, tg - inn.runs))}`)}</span>}
          </div>
          <div className="bc-over">{over.map((e, i) => <span key={i} className={`ball ${e.out ? 'w' : e.extra ? 'nb' : e.runs === 6 ? 's' : ''}`}>{e.out ? 'W' : e.extra ? 'nb' : n(e.runs)}</span>)}</div>
        </div>
        {tg !== undefined && m.current === 1 && <div className="bc-chase"><ChaseHud c={{ target: tg, runs: inn.runs, wickets: inn.wickets, maxWickets: m.config.wickets, balls: inn.balls, maxBalls: lim.balls, par: 2.6, events: inn.events, name: names[batSide] }} /></div>}

        <div className={`bc-book-wrap ${aiTurn ? 'ai' : ''}`} onPointerDown={(e) => { e.preventDefault(); down(); }} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} data-testid="book">
          <Book state={book} page={page} owner={card[si]?.name ?? ''} numFmt={(v) => n(v)} highlight={showDigit} />
          {stamp && <div className={`bc-stamp ${stamp.kind}`} data-testid="stamp">{stamp.text}</div>}
          {showDigit && m.lastPage !== null && book === 'open' && <div className="bc-explain">{t(`Page ${m.lastPage}`, `পৃষ্ঠা ${n(m.lastPage)}`)} → {t(`Last digit ${lastDigit(m.lastPage)}`, `শেষ অঙ্ক ${n(lastDigit(m.lastPage))}`)}</div>}
        </div>

        <aside className="bc-card">
          <h3><Flag id={spec.teams[batSide]} size={20} /> {t('Scorecard', 'স্কোরকার্ড')} — {names[batSide]}</h3>
          <ol>
            {card.map((b, i) => (
              <li key={i} className={`${b.out ? 'out' : ''} ${i === si && !b.out ? 'now' : ''}`}>
                <span className="nm">{b.name}</span>
                <span className="sc">{b.balls || b.out || i === si ? `${n(b.runs)} (${n(b.balls)})` : '—'}</span>
                <span className="st">{b.out ? t('out', 'আউট') : i === si ? '•' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="bc-legend">{t('Last digit:', 'শেষ অঙ্ক:')} {DIGITS.map((d) => <span key={d} className="chip">{n(d)} = {describe(m.config.rules.map[d as Digit], t, n).replace('!', '')}</span>)}</div>
        </aside>

        <div className="bc-controls">
          {aiTurn ? <div className="bc-ai-note">{t('The computer is opening the book…', 'কম্পিউটার বই খুলছে…')}</div> : (
            <button className={`btn big bc-hold ${holding ? 'down' : ''}`} onPointerDown={(e) => { e.preventDefault(); down(); }} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} disabled={(busy && !holding) || phase !== 'play'} data-testid="hold">
              {t('Hold, then let go', 'ধরে রাখো, তারপর ছাড়ো')} <span className="key-hint hide-touch">{t('or hold Space', 'বা স্পেস চেপে ধরো')}</span>
            </button>
          )}
        </div>
      </div>

      {phase === 'toss' && !paused && <Overlay label={t('Toss', 'টস')}><CoinToss names={names} vsAI={vsAI} onDone={(b) => { setMatch(newMatch(config, b ? 0 : 1, lineups)); setPhase('play'); sfx('whistle'); }} /></Overlay>}
      {phase === 'break' && !paused && (
        <Overlay label={t('Innings break', 'ইনিংস বিরতি')}>
          <div className="sheet ruled">
            <h2>{t('Innings break', 'ইনিংস বিরতি')}</h2>
            <p className="lede">{t(`${names[m.battingFirst]} made ${m.innings[0].runs}/${m.innings[0].wickets}.`, `${names[m.battingFirst]} করেছে ${n(m.innings[0].runs)}/${n(m.innings[0].wickets)}।`)}</p>
            <p className="break-target">{t(`${names[other(m.battingFirst)]} need ${m.innings[0].runs + 1}${lim.balls ? ` from ${lim.balls} balls` : ''}`, `${names[other(m.battingFirst)]}-এর লাগবে ${n(m.innings[0].runs + 1)}${lim.balls ? `, ${n(lim.balls)} বলে` : ''}`)}</p>
            <div className="actions"><button className="btn big" onClick={() => { setPhase('play'); sfx('bell'); }} data-testid="chase" autoFocus>{t('Start the chase', 'তাড়া শুরু করো')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={onRestart} onQuit={onQuit} help={help} />}
    </div>
  );
}

export const BOOK_ADAPTER: CricketAdapter = {
  id: 'book-cricket',
  title: { bn: 'বই ক্রিকেট', en: 'Book Cricket' },
  lede: { bn: 'সবার ব্যাগেই একটা বই ছিল, যেটা টিফিনে ক্রিকেট মাঠ হয়ে যেত।', en: 'Every school bag had one: the book that became a cricket match.' },
  Match: BookMatch,
  par: 2.6,
  usesDifficulty: false,
  overs: [1, 3, 5],
  wickets: [1, 3, 5, 10],
  defOvers: 3,
  defWickets: 3,
  allowNoLimit: true,
  cup: { overs: 3, wickets: 3 },
  rules: rulesList,
  Options: BookOptions,
  defaultExtra: { rules: 'classic' },
  icon: <svg viewBox="0 0 64 64"><rect x="8" y="12" width="48" height="40" rx="3" fill="#c8a46a" stroke="#6b4a1f" strokeWidth="3" /><path d="M32 14v36" stroke="#6b4a1f" strokeWidth="3" /><text x="18" y="40" fontSize="14" fontWeight="800" fill="#1f3a93">46</text></svg>,
  achievements: (o, spec, won) => {
    const ids: string[] = [];
    if ((o.topScore ?? 0) >= 50) ids.push('bc-fifty');
    if (won && spec.vsAI) ids.push('bc-win');
    if (won && spec.mode === 'challenge' && Number(spec.extra.level) >= 12) ids.push('book-cricket-ladder');
    return ids;
  },
};

export default function BookCricket({ onExit }: GameProps) {
  return <CricketHub game={BOOK_ADAPTER} onExit={onExit} />;
}
