import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { currentOver, oversText, ballsLeft } from '../../shared/cricket';
import { DifficultySeg, ModeSeg, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode, Overlay } from '../../components/ui';
import { HandAI } from './ai';
import { Hand } from './Hand';
import { battingSide, limitsOf, newMatch, other, playBall, targetOf, tossWinner, type HCConfig, type HCState, type Side } from './logic';
import './hand-cricket.css';

const S: StringTable<
  | 'setupTitle' | 'setupLede' | 'wickets' | 'overs' | 'classic' | 'r1' | 'r2' | 'r3' | 'r4'
  | 'tossTitle' | 'tossCall' | 'odd' | 'even' | 'tossPick' | 'tossSum' | 'tossWon' | 'batFirst' | 'bowlFirst' | 'aiChose'
  | 'continue' | 'batting' | 'bowling' | 'pick' | 'locked' | 'waiting' | 'out' | 'runs' | 'six' | 'target' | 'need' | 'over'
  | 'breakTitle' | 'breakText' | 'secondInnings' | 'wonRuns' | 'wonWkts' | 'tied' | 'firstInn' | 'secondInn' | 'sixes'
  | 'favNum' | 'favCaught' | 'balls' | 'chooseBatBowl' | 'aiBats' | 'aiBowls' | 'keys'
> = {
  en: {
    setupTitle: 'Hand Cricket', setupLede: 'The bench game with no bat and no ball. Only your hand.',
    wickets: 'Wickets', overs: 'Overs', classic: 'No limit (classic)',
    r1: 'Both players show a number from 1 to 6 at the same time. Six is the thumb.',
    r2: 'If the numbers are different, the batter scores the batter’s number.',
    r3: 'If the numbers are the same, the batter is OUT.',
    r4: 'Then the other side bats and chases the target.',
    tossTitle: 'Toss: odd or even?', tossCall: '{name}, call odd or even.', odd: 'Odd', even: 'Even',
    tossPick: 'Now both show a number.', tossSum: '{a} + {b} = {s}', tossWon: '{name} won the toss!',
    batFirst: 'Bat first', bowlFirst: 'Bowl first', aiChose: 'The computer chose to {what}.', continue: 'Continue',
    batting: 'Batting', bowling: 'Bowling', pick: 'Show your number', locked: 'Locked ✓', waiting: 'Waiting…',
    out: 'OUT!', runs: '{n} runs', six: 'SIX!', target: 'Target {n}', need: 'Need {r} from {b} balls', over: 'Over {o}',
    breakTitle: 'Innings break', breakText: '{name} scored {r}/{w}. Target: {t}.', secondInnings: 'Start the chase',
    wonRuns: '{name} won by {m} runs', wonWkts: '{name} won by {m} wickets', tied: 'Match tied!',
    firstInn: '1st innings — {name}', secondInn: '2nd innings — {name}', sixes: 'Sixes by {name}',
    favNum: 'Your most used number', favCaught: '{n} (the computer noticed!)', balls: '{n} balls',
    chooseBatBowl: 'What do you want to do?', aiBats: 'bat first', aiBowls: 'bowl first', keys: 'Keys',
  },
  bn: {
    setupTitle: 'হ্যান্ড ক্রিকেট', setupLede: 'ব্যাট নেই, বল নেই। শুধু হাত। বেঞ্চের সেই খেলা।',
    wickets: 'উইকেট', overs: 'ওভার', classic: 'সীমা নেই (আসল নিয়ম)',
    r1: 'দুজনে একসাথে ১ থেকে ৬-এর মধ্যে একটা সংখ্যা দেখাবে। ছয় মানে বুড়ো আঙুল।',
    r2: 'সংখ্যা আলাদা হলে ব্যাটার তার নিজের সংখ্যার সমান রান পাবে।',
    r3: 'সংখ্যা মিলে গেলেই ব্যাটার আউট!',
    r4: 'তারপর অন্যজন ব্যাট করে লক্ষ্য তাড়া করবে।',
    tossTitle: 'টস: জোড় না বিজোড়?', tossCall: '{name}, জোড় না বিজোড় বলো।', odd: 'বিজোড়', even: 'জোড়',
    tossPick: 'এবার দুজনেই একটা সংখ্যা দেখাও।', tossSum: '{a} + {b} = {s}', tossWon: '{name} টস জিতেছে!',
    batFirst: 'আগে ব্যাট', bowlFirst: 'আগে বল', aiChose: 'কম্পিউটার {what} নিয়েছে।', continue: 'চলো',
    batting: 'ব্যাটিং', bowling: 'বোলিং', pick: 'সংখ্যা দেখাও', locked: 'বাছাই হয়েছে ✓', waiting: 'অপেক্ষা…',
    out: 'আউট!', runs: '{n} রান', six: 'ছক্কা!', target: 'লক্ষ্য {n}', need: '{b} বলে লাগবে {r}', over: 'ওভার {o}',
    breakTitle: 'ইনিংস বিরতি', breakText: '{name} করেছে {r}/{w}। লক্ষ্য: {t}।', secondInnings: 'তাড়া শুরু করো',
    wonRuns: '{name} {m} রানে জিতেছে', wonWkts: '{name} {m} উইকেটে জিতেছে', tied: 'ম্যাচ টাই!',
    firstInn: '১ম ইনিংস — {name}', secondInn: '২য় ইনিংস — {name}', sixes: '{name}-এর ছক্কা',
    favNum: 'তোমার প্রিয় সংখ্যা', favCaught: '{n} (কম্পিউটার ধরে ফেলেছে!)', balls: '{n} বল',
    chooseBatBowl: 'কী করবে?', aiBats: 'আগে ব্যাট', aiBowls: 'আগে বল', keys: 'কী-বোর্ড',
  },
};

type Phase = 'setup' | 'tossCall' | 'tossPick' | 'tossResult' | 'play' | 'break' | 'result';
const P2_KEYS = ['u', 'i', 'o', 'j', 'k', 'l'];

export default function HandCricket({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();

  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [wickets, setWickets] = useState(2);
  const [overs, setOvers] = useState<number | null>(2);

  const [phase, setPhase] = useState<Phase>('setup');
  const [paused, setPaused] = useState(false);
  const [call, setCall] = useState<'odd' | 'even'>('odd');
  const [tossNums, setTossNums] = useState<[number, number] | null>(null);
  const [tossWin, setTossWin] = useState<Side>(0);
  const [match, setMatch] = useState<HCState | null>(null);
  const [picks, setPicks] = useState<[number | null, number | null]>([null, null]);
  const [reveal, setReveal] = useState<'idle' | 'shake' | 'show'>('idle');
  const [shown, setShown] = useState<[number, number]>([0, 0]);
  const [flash, setFlash] = useState<{ text: string; kind: 'out' | 'six' | 'runs' } | null>(null);
  const [summary, setSummary] = useState<{ newBest: boolean } | null>(null);

  const rng = useMemo(() => createRng(), []);
  const aiRef = useRef<HandAI | null>(null);
  const aiPick = useRef<number | null>(null);
  const usage = useRef<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const vsAI = mode === 'ai';
  const names: [string, string] = vsAI ? [u('you'), u('computer')] : [n1, n2];
  const config: HCConfig = { wickets, overs };

  const restart = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPaused(false);
    setMatch(null);
    setPicks([null, null]);
    setReveal('idle');
    setFlash(null);
    setTossNums(null);
    setSummary(null);
    usage.current = [0, 0, 0, 0, 0, 0, 0];
    aiRef.current = new HandAI(diff, rng);
    setPhase('tossCall');
    sfx('bell');
  }, [diff, rng]);

  const inPlay = phase === 'play' || phase === 'break' || phase.startsWith('toss');
  useGameBar({
    onPause: inPlay ? () => setPaused(true) : undefined,
    help: <Rules t={t} />,
  }, [inPlay, t.lang]);

  // The computer commits to its number at the start of each ball, before the human picks.
  const commitAI = useCallback((m: HCState) => {
    if (!vsAI || !aiRef.current || m.done) return;
    const bat = battingSide(m);
    const inn = m.innings[m.current];
    const lim = limitsOf(m.config);
    const tg = targetOf(m);
    const role = bat === 1 ? 'bat' : 'bowl';
    aiPick.current = aiRef.current.choose(role, {
      need: tg !== undefined && bat === 1 ? tg - inn.runs : undefined,
      wicketsLeft: m.config.wickets - inn.wickets,
      ballsLeft: ballsLeft(inn, lim),
    });
  }, [vsAI]);

  const startMatch = (battingFirst: Side) => {
    const m = newMatch(config, battingFirst);
    setMatch(m);
    setPicks([null, null]);
    setPhase('play');
    commitAI(m);
  };

  // ---- Toss ----
  const tossPick = (side: Side, n: number) => {
    if (phase !== 'tossPick') return;
    sfx('click');
    const next: [number | null, number | null] = [...picks] as [number | null, number | null];
    next[side] = n;
    if (vsAI) next[1] = rng.int(1, 6);
    setPicks(next);
    if (next[0] !== null && next[1] !== null) {
      const a = next[0], b = next[1];
      setTossNums([a, b]);
      setReveal('shake');
      later(() => {
        setShown([a, b]);
        setReveal('show');
        const w = tossWinner(0, call, a, b);
        setTossWin(w);
        sfx('good');
        setPhase('tossResult');
        setPicks([null, null]);
      }, 600);
    }
  };

  // ---- A ball ----
  const pick = (side: Side, n: number) => {
    if (phase === 'tossPick') return tossPick(side, n);
    if (phase !== 'play' || !match || paused || reveal === 'shake' || flash) return;
    if (picks[side] !== null) return;
    if (vsAI && side === 1) return;
    sfx('click', { pitch: 1.2 });
    vibrate(10);
    const next: [number | null, number | null] = [...picks] as [number | null, number | null];
    next[side] = n;
    if (vsAI) next[1] = aiPick.current ?? rng.int(1, 6);
    setPicks(next);
    if (next[0] === null || next[1] === null) return;
    const a = next[0], b = next[1];
    setReveal('shake');
    later(() => {
      setShown([a, b]);
      setReveal('show');
      const bat = battingSide(match);
      const batN = bat === 0 ? a : b;
      const bowlN = bat === 0 ? b : a;
      if (vsAI && aiRef.current) aiRef.current.observe(bat === 0 ? 'bat' : 'bowl', a);
      usage.current[a]++;
      const m2 = playBall(match, batN, bowlN);
      const rec = m2.last!;
      if (rec.out) { sfx('out'); vibrate([30, 40, 60]); setFlash({ text: t('out'), kind: 'out' }); }
      else if (rec.runs === 6) { sfx('six'); vibrate(20); setFlash({ text: t('six'), kind: 'six' }); }
      else { sfx('good', { pitch: 0.8 + rec.runs * 0.06 }); setFlash({ text: t('runs', { n: rec.runs }), kind: 'runs' }); }
      setMatch(m2);
      later(() => {
        setFlash(null);
        setPicks([null, null]);
        setReveal('idle');
        if (m2.done) finish(m2);
        else if (m2.current !== match.current) { setPhase('break'); sfx('whistle'); }
        else commitAI(m2);
      }, rec.out ? 1100 : 850);
    }, 600);
  };

  const finish = (m: HCState) => {
    setPhase('result');
    const r = m.result!;
    const humanInnings = vsAI ? m.innings[m.battingFirst === 0 ? 0 : 1] : null;
    const outcome = !vsAI ? 'none' : r.winnerSide === null ? 'tie' : r.winnerSide === 0 ? 'win' : 'loss';
    const res = recordResult('hand-cricket', {
      outcome,
      score: humanInnings?.runs,
      records: { highestInnings: Math.max(m.innings[0].runs, m.innings[1].runs) },
    }, (_s, rr) => {
      const ids: string[] = [];
      if (m.innings[0].runs >= 100 || m.innings[1].runs >= 100) ids.push('hc-century');
      if (rr.outcome === 'win' && diff === 'hard') ids.push('hc-hard-win');
      return ids;
    });
    setSummary({ newBest: vsAI && res.newBest });
  };

  // ---- Keyboard ----
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (paused) return;
      if (e.key >= '1' && e.key <= '6') pick(0, Number(e.key));
      const i = P2_KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && !vsAI) pick(1, i + 1);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  // ---- Render ----
  if (phase === 'setup') {
    return (
      <div className="hc-root">
        <Overlay label={t('setupTitle')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('setupTitle')}</h2>
            <p className="lede">{t('setupLede')}</p>
            <Rules t={t} />
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            {vsAI && <DifficultySeg value={diff} onChange={setDiff} />}
            <div className="opt-label">{t('wickets')}</div>
            <Seg label={t('wickets')} value={wickets} onChange={setWickets} options={[1, 2, 3, 5].map((v) => ({ v, label: t.n(v) }))} />
            <div className="opt-label">{t('overs')}</div>
            <Seg label={t('overs')} value={overs ?? 0} onChange={(v) => setOvers(v === 0 ? null : v)} options={[{ v: 0, label: t('classic') }, ...[1, 2, 5].map((v) => ({ v, label: t.n(v) }))]} />
            <div className="actions"><button className="btn big" onClick={restart} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const m = match;
  const batSide = m ? battingSide(m) : 0;
  const inn = m ? m.innings[m.current] : null;
  const lim = limitsOf(config);
  const tg = m ? targetOf(m) : undefined;
  const left = inn ? ballsLeft(inn, lim) : null;
  const tossing = phase.startsWith('toss');

  const roleOf = (side: Side) => (tossing ? '' : side === batSide ? t('batting') : t('bowling'));
  const pad = (side: Side) => {
    const isAI = vsAI && side === 1;
    const lockedNow = picks[side] !== null;
    const active = (phase === 'play' || phase === 'tossPick') && !lockedNow && !isAI && reveal !== 'shake' && !flash;
    return (
      <div className={`hc-pad ${side === 1 ? 'top' : 'bottom'} ${!vsAI && side === 1 ? 'opposite' : ''}`} data-testid={`pad-${side}`}>
        <div className="hc-pad-head">
          <b>{names[side]}</b> <span className={`role ${side === batSide ? 'bat' : 'bowl'}`}>{roleOf(side)}</span>
          <span className="hc-pad-state">{lockedNow ? t('locked') : active ? t('pick') : ''}</span>
        </div>
        <div className="hc-buttons">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className="hc-num" disabled={!active} onClick={() => pick(side, n)} aria-label={String(n)} data-testid={`p${side}-${n}`}>
              <Hand n={n} className="mini" />
              <span className="lbl">{t.n(n)}</span>
              <span className="key-hint hide-touch">{side === 0 ? n : P2_KEYS[n - 1].toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const handN = (side: Side) => (reveal === 'show' ? shown[side] : 0);
  const over = inn ? currentOver(inn.events) : [];

  return (
    <div className={`hc-root ${vsAI ? 'vs-ai' : 'two-p'}`}>
      {!vsAI && pad(1)}
      <div className="hc-stage">
        <div className="hud-chalk hc-board" aria-live="polite">
          {m && inn ? (
            <>
              <div className="hc-board-row">
                <span className="hc-team">{names[batSide]}</span>
                <span className="hc-score" data-testid="score">{t.n(inn.runs)}/{t.n(inn.wickets)}</span>
              </div>
              <div className="hc-board-row small">
                {lim.balls !== null && <span>{t('over', { o: t.n(oversText(inn.balls)) })} / {t.n(m.config.overs!)}</span>}
                {tg !== undefined && <span>{t('target', { n: tg })}</span>}
                {tg !== undefined && <span className="need">{left !== null ? t('need', { r: Math.max(0, tg - inn.runs), b: left }) : t('need', { r: Math.max(0, tg - inn.runs), b: '∞' })}</span>}
              </div>
              <div className="hc-over">
                {over.map((e, i) => <span key={i} className={`ball ${e.out ? 'w' : e.runs === 6 ? 's' : ''}`}>{e.out ? 'W' : t.n(e.runs)}</span>)}
              </div>
            </>
          ) : (
            <div className="hc-board-row"><span className="hc-team">{t('tossTitle')}</span></div>
          )}
        </div>
        <div className="hc-arena">
          <div className={`hc-hand left ${reveal === 'shake' ? 'shake' : ''}`}><Hand n={handN(0)} cuff="#1f3a8a" label={names[0]} /></div>
          <div className="hc-vs">{flash ? <span className={`hc-flash ${flash.kind}`} data-testid="flash">{flash.text}</span> : <span className="vs">VS</span>}</div>
          <div className={`hc-hand right ${reveal === 'shake' ? 'shake' : ''}`}><Hand n={handN(1)} mirror cuff="#8b1e1e" label={names[1]} /></div>
        </div>
      </div>
      {pad(0)}

      {phase === 'tossCall' && !paused && (
        <Overlay label={t('tossTitle')}>
          <div className="sheet ruled">
            <h2>{t('tossTitle')}</h2>
            <p className="lede">{t('tossCall', { name: names[0] })}</p>
            <div className="actions">
              <button className="btn big" onClick={() => { setCall('odd'); setPhase('tossPick'); sfx('click'); }} data-testid="call-odd">{t('odd')}</button>
              <button className="btn big secondary" onClick={() => { setCall('even'); setPhase('tossPick'); sfx('click'); }}>{t('even')}</button>
            </div>
          </div>
        </Overlay>
      )}
      {phase === 'tossPick' && <div className="hc-banner">{t('tossPick')}</div>}
      {phase === 'tossResult' && tossNums && !paused && (
        <Overlay label={t('tossWon', { name: names[tossWin] })}>
          <div className="sheet ruled">
            <h2>{t('tossWon', { name: names[tossWin] })}</h2>
            <p className="lede">{t('tossSum', { a: tossNums[0], b: tossNums[1], s: tossNums[0] + tossNums[1] })} — {(tossNums[0] + tossNums[1]) % 2 ? t('odd') : t('even')}</p>
            {vsAI && tossWin === 1 ? (
              <TossAI t={t} ai={aiRef.current!} onGo={(batFirst) => startMatch(batFirst ? 1 : 0)} />
            ) : (
              <>
                <h3>{t('chooseBatBowl')}</h3>
                <div className="actions">
                  <button className="btn big" onClick={() => startMatch(tossWin)} data-testid="bat-first">{t('batFirst')}</button>
                  <button className="btn big secondary" onClick={() => startMatch(other(tossWin))}>{t('bowlFirst')}</button>
                </div>
              </>
            )}
          </div>
        </Overlay>
      )}
      {phase === 'break' && m && !paused && (
        <Overlay label={t('breakTitle')}>
          <div className="sheet ruled">
            <h2>{t('breakTitle')}</h2>
            <p className="lede">{t('breakText', { name: names[m.battingFirst], r: m.innings[0].runs, w: m.innings[0].wickets, t: m.innings[0].runs + 1 })}</p>
            <div className="actions"><button className="btn big" data-testid="second-innings" onClick={() => { setPhase('play'); commitAI(m); sfx('bell'); }}>{t('secondInnings')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={restart} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && m?.result && (
        <ReportCard
          outcome={vsAI ? (m.result.winnerSide === null ? 'tie' : m.result.winnerSide === 0 ? 'win' : 'loss') : m.result.winnerSide === null ? 'tie' : 'none'}
          title={m.result.winnerSide === null ? t('tied') : m.result.kind === 'runs' ? t('wonRuns', { name: names[m.result.winnerSide], m: m.result.margin }) : t('wonWkts', { name: names[m.result.winnerSide], m: m.result.margin })}
          rows={[
            [t('firstInn', { name: names[m.battingFirst] }), `${t.n(m.innings[0].runs)}/${t.n(m.innings[0].wickets)} (${t('balls', { n: m.innings[0].balls })})`],
            [t('secondInn', { name: names[other(m.battingFirst)] }), `${t.n(m.innings[1].runs)}/${t.n(m.innings[1].wickets)} (${t('balls', { n: m.innings[1].balls })})`],
            [t('sixes', { name: names[m.battingFirst] }), m.innings[0].events.filter((e) => e.runs === 6).length],
            [t('sixes', { name: names[other(m.battingFirst)] }), m.innings[1].events.filter((e) => e.runs === 6).length],
            ...(vsAI ? [[t('favNum'), t('favCaught', { n: favourite(usage.current) })] as [string, string]] : []),
          ]}
          newBest={summary?.newBest}
          onAgain={restart}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      )}
    </div>
  );
}

function favourite(u: number[]): number {
  let best = 1;
  for (let i = 1; i <= 6; i++) if (u[i] > u[best]) best = i;
  return best;
}

function TossAI({ t, ai, onGo }: { t: ReturnType<typeof useT<'aiChose' | 'aiBats' | 'aiBowls' | 'continue'>>; ai: HandAI; onGo: (aiBatsFirst: boolean) => void }) {
  const [choice] = useState(() => ai.chooseBatFirst());
  return (
    <>
      <p>{t('aiChose', { what: choice ? t('aiBats') : t('aiBowls') })}</p>
      <div className="actions"><button className="btn big" onClick={() => onGo(choice)} data-testid="toss-continue" autoFocus>{t('continue')}</button></div>
    </>
  );
}

function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4'>> }) {
  return (
    <ol>
      <li>{t('r1')}</li>
      <li>{t('r2')}</li>
      <li><b>{t('r3')}</b></li>
      <li>{t('r4')}</li>
    </ol>
  );
}
