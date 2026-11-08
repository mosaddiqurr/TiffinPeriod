import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { ballsLeft, currentOver, oversText } from '../../shared/cricket';
import { getTeam } from '../../shared/teams';
import { Overlay, PauseMenu, useGameBar } from '../../components/ui';
import { ChaseHud, CoinToss, Flag, useTx } from '../../components/sport/SportKit';
import type { CricketMatchProps } from '../../components/sport/CricketHub';
import type { Difficulty } from '../../shared/cricketModes';
import { battingSide, limitsOf, newChase, newMatch, other, playBall, targetOf, tossWinner, type BallRecord, type HCConfig, type HCState, type PickRules, type Side } from './logic';
import type { Situation } from './ai';
import './hand-cricket.css';

// One match of a "secret number" cricket game: both players commit a number,
// then both are revealed. Hand Cricket and Number Cricket share this screen.

export interface PickAI {
  choose(role: 'bat' | 'bowl', sit: Situation): number;
  observe(opponentRole: 'bat' | 'bowl', n: number): void;
  chooseBatFirst(): boolean;
}

export interface PickVariant {
  gameId: string;
  nums: number[];
  rules: PickRules;
  makeAI: (d: Difficulty, rng: Rng) => PickAI;
  /** The big revealed pick. n = null while hidden. */
  Reveal: (p: { n: number | null; side: Side; cuff: string; label: string; shaking: boolean }) => ReactNode;
  /** The small picture inside a pick button. */
  ButtonArt: (p: { n: number }) => ReactNode;
  keys: string[];
  p2Keys: string[];
  rootClass: string;
  toss: 'oddeven' | 'coin';
  par: number;
  rulesList: (t: (en: string, bn: string) => string) => string[];
  /** Extra text under a revealed ball, for example the zero rule. */
  explain?: (rec: BallRecord, t: (en: string, bn: string) => string) => string | null;
}

type Phase = 'tossCall' | 'tossPick' | 'tossResult' | 'coin' | 'play' | 'break' | 'over';

export function PickMatch({ spec, onDone, onQuit, onRestart, v }: CricketMatchProps & { v: PickVariant }) {
  const x = useTx();
  const { t, n } = x;
  const vsAI = spec.vsAI;
  const names = spec.names;
  const kit: [string, string] = [getTeam(spec.teams[0]).kit[0], getTeam(spec.teams[1]).kit[0]];
  const config: HCConfig = spec.chase ? { wickets: spec.chase.wickets, overs: null, balls: spec.chase.balls } : { wickets: spec.wickets, overs: spec.overs };

  const rng = useMemo(() => createRng(spec.seed), [spec.seed]);
  const aiRef = useRef<PickAI>(v.makeAI(spec.difficulty, rng));
  const aiPick = useRef<number | null>(null);
  const usage = useRef<Record<number, number>>({});
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const firstPhase: Phase = spec.chase ? 'play' : spec.start === 'toss' ? (v.toss === 'oddeven' ? 'tossCall' : 'coin') : 'play';
  const [phase, setPhase] = useState<Phase>(firstPhase);
  const [match, setMatch] = useState<HCState | null>(() => spec.chase ? newChase(config, spec.chase.target) : spec.start === 'toss' ? null : newMatch(config, spec.start === 'bat' ? 0 : 1));
  const [paused, setPaused] = useState(false);
  const [call, setCall] = useState<'odd' | 'even'>('odd');
  const [tossNums, setTossNums] = useState<[number, number] | null>(null);
  const [tossWin, setTossWin] = useState<Side>(0);
  const [picks, setPicks] = useState<[number | null, number | null]>([null, null]);
  const [reveal, setReveal] = useState<'idle' | 'shake' | 'show'>('idle');
  const [shown, setShown] = useState<[number, number]>([0, 0]);
  /** Whether the hands show a number yet (before the first ball they show a closed fist). */
  const [hasShown, setHasShown] = useState(false);
  /** The number each side tapped last, so its button stays highlighted. */
  const [lastTap, setLastTap] = useState<[number | null, number | null]>([null, null]);
  const [flash, setFlash] = useState<{ text: string; kind: 'out' | 'six' | 'runs'; note?: string | null } | null>(null);
  const [aiToss] = useState(() => aiRef.current.chooseBatFirst());

  const help = <ol>{v.rulesList(t).map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ onPause: phase !== 'over' ? () => setPaused(true) : undefined, onResume: () => setPaused(false), help }, [phase, x.lang]);

  // The computer commits to its number at the start of each ball, before the human picks.
  const commitAI = useCallback((m: HCState) => {
    if (!vsAI || m.done) return;
    const bat = battingSide(m);
    const inn = m.innings[m.current];
    const lim = limitsOf(m.config);
    const tg = targetOf(m);
    aiPick.current = aiRef.current.choose(bat === 1 ? 'bat' : 'bowl', {
      need: tg !== undefined && bat === 1 ? tg - inn.runs : undefined,
      wicketsLeft: m.config.wickets - inn.wickets,
      ballsLeft: ballsLeft(inn, lim),
    });
  }, [vsAI]);

  useEffect(() => { if (match && phase === 'play') commitAI(match); sfx('bell'); /* first ball */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startMatch = (battingFirst: Side) => {
    const m = newMatch(config, battingFirst);
    setMatch(m); setPicks([null, null]); setPhase('play'); commitAI(m); sfx('whistle');
  };

  const tossPick = (side: Side, num: number) => {
    const next: [number | null, number | null] = [...picks] as [number | null, number | null];
    next[side] = num;
    if (vsAI) next[1] = rng.int(1, 6);
    setPicks(next);
    sfx('click');
    if (next[0] !== null && next[1] !== null) {
      const a = next[0], b = next[1];
      setTossNums([a, b]); setReveal('shake');
      later(() => { setShown([a, b]); setHasShown(true); setReveal('show'); setTossWin(tossWinner(0, call, a, b)); sfx('good'); setPhase('tossResult'); setPicks([null, null]); }, 600);
    }
  };

  const finish = (m: HCState) => {
    setPhase('over');
    const fav = Object.entries(usage.current).sort((a, b) => b[1] - a[1])[0];
    const sixes = (i: 0 | 1) => m.innings[i].events.filter((e) => e.runs >= 6).length;
    const rows: Array<[string, string | number]> = [];
    if (!spec.chase) rows.push([t(`Sixes — ${names[m.battingFirst]}`, `ছক্কা — ${names[m.battingFirst]}`), sixes(0)]);
    rows.push([t(`Sixes — ${names[other(m.battingFirst)]}`, `ছক্কা — ${names[other(m.battingFirst)]}`), sixes(1)]);
    if (vsAI && fav) rows.push([t('Your most used number', 'তোমার প্রিয় সংখ্যা'), n(Number(fav[0]))]);
    later(() => onDone({ battingFirst: m.battingFirst, innings: m.innings, result: m.result!, rows, topScore: Math.max(m.innings[0].runs, m.innings[1].runs) }), 400);
  };

  const pick = (side: Side, num: number) => {
    if (paused) return;
    if (phase === 'tossPick') { if (side === 0 || !vsAI) tossPick(side, num); return; }
    if (phase !== 'play' || !match || reveal === 'shake' || flash) return;
    if (picks[side] !== null || (vsAI && side === 1)) return;
    sfx('click', { pitch: 1.2 }); vibrate(10);
    setLastTap((l) => (side === 0 ? [num, l[1]] : [l[0], num]));
    const next: [number | null, number | null] = [...picks] as [number | null, number | null];
    next[side] = num;
    if (vsAI) next[1] = aiPick.current ?? rng.pick(v.nums);
    setPicks(next);
    if (next[0] === null || next[1] === null) return;
    const a = next[0], b = next[1];
    setReveal('shake');
    later(() => {
      setShown([a, b]); setHasShown(true); setReveal('show');
      const bat = battingSide(match);
      const batN = bat === 0 ? a : b;
      const bowlN = bat === 0 ? b : a;
      if (vsAI) aiRef.current.observe(bat === 0 ? 'bat' : 'bowl', a);
      usage.current[a] = (usage.current[a] ?? 0) + 1;
      const m2 = playBall(match, batN, bowlN, v.rules);
      const rec = m2.last!;
      const note = v.explain?.(rec, t) ?? null;
      if (rec.out) { sfx('out'); vibrate([30, 40, 60]); setFlash({ text: t('OUT!', 'আউট!'), kind: 'out', note }); }
      else if (rec.runs >= 6) { sfx('six'); vibrate(20); setFlash({ text: rec.runs === 6 ? t('SIX!', 'ছক্কা!') : t(`${rec.runs}!`, `${n(rec.runs)}!`), kind: 'six', note }); }
      else { sfx('good', { pitch: 0.8 + rec.runs * 0.06 }); setFlash({ text: rec.runs === 0 ? t('Dot ball', 'ডট বল') : t(`${rec.runs} ${rec.runs === 1 ? 'run' : 'runs'}`, `${n(rec.runs)} রান`), kind: 'runs', note }); }
      setMatch(m2);
      later(() => {
        setFlash(null); setPicks([null, null]); setReveal('idle');
        if (m2.done) finish(m2);
        else if (m2.current !== match.current) { setPhase('break'); sfx('whistle'); }
        else commitAI(m2);
      }, rec.out ? 1150 : 900);
    }, 600);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (paused || e.repeat) return;
      const i = v.keys.indexOf(e.key);
      if (i >= 0) pick(0, v.nums[i]);
      const j = v.p2Keys.indexOf(e.key.toLowerCase());
      if (j >= 0 && !vsAI) pick(1, v.nums[j]);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const m = match;
  const batSide = m ? battingSide(m) : 0;
  const inn = m ? m.innings[m.current] : null;
  const lim = limitsOf(config);
  const tg = m ? targetOf(m) : undefined;
  const tossing = phase === 'tossCall' || phase === 'tossPick' || phase === 'tossResult' || phase === 'coin';
  const padNums = phase === 'tossPick' ? [1, 2, 3, 4, 5, 6] : v.nums;

  const pad = (side: Side) => {
    const isAI = vsAI && side === 1;
    const lockedNow = picks[side] !== null;
    const active = (phase === 'play' || phase === 'tossPick') && !lockedNow && !isAI && reveal !== 'shake' && !flash;
    const role = tossing ? '' : side === batSide ? t('Batting', 'ব্যাটিং') : t('Bowling', 'বোলিং');
    return (
      <div className={`hc-pad ${side === 1 ? 'top' : 'bottom'} ${!vsAI && side === 1 ? 'opposite' : ''}`} data-testid={`pad-${side}`}>
        <div className="hc-pad-head">
          <Flag id={spec.teams[side]} size={24} /><b>{names[side]}</b> <span className={`role ${side === batSide ? 'bat' : 'bowl'}`}>{role}</span>
          <span className="hc-pad-state">{lockedNow ? t('Locked ✓', 'বাছাই হয়েছে ✓') : active ? t('Pick your number', 'সংখ্যা বাছো') : ''}</span>
        </div>
        <div className={`hc-buttons n${padNums.length}`}>
          {padNums.map((num, i) => (
            <button key={num} className={`hc-num${!active ? ' wait' : ''}${phase !== 'tossPick' && lastTap[side] === num ? ' last' : ''}`} aria-disabled={!active} onClick={() => { if (active) pick(side, num); }} aria-label={String(num)} data-testid={`p${side}-${num}`}>
              {phase === 'tossPick' ? <span className="lbl big">{n(num)}</span> : v.ButtonArt({ n: num })}
              {phase !== 'tossPick' && <span className="lbl">{n(num)}</span>}
              <span className="key-hint hide-touch">{side === 0 ? (phase === 'tossPick' ? num : v.keys[i]) : (phase === 'tossPick' ? v.p2Keys[num - 1]?.toUpperCase() : v.p2Keys[i]?.toUpperCase())}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const over = inn ? currentOver(inn.events) : [];
  const chasing = m && m.current === 1 && tg !== undefined && inn;
  // While the hands shake they are fists; otherwise they keep showing the last numbers played.
  const revealN = (side: Side) => (reveal === 'shake' || !hasShown ? null : shown[side]);

  return (
    <div className={`hc-root ${v.rootClass} ${vsAI ? 'vs-ai' : 'two-p'}`}>
      {!vsAI && pad(1)}
      <div className="hc-stage">
        <div className="hud-chalk hc-board" aria-live="polite">
          {m && inn ? (
            <>
              <div className="hc-board-row">
                <span className="hc-team"><Flag id={spec.teams[batSide]} size={26} /> {names[batSide]}</span>
                <span className="hc-score" data-testid="score">{n(inn.runs)}/{n(inn.wickets)}</span>
              </div>
              <div className="hc-board-row small">
                {spec.occasion && <span>{spec.occasion}</span>}
                {lim.balls !== null && <span>{t('Over', 'ওভার')} {n(oversText(inn.balls))}{config.overs ? ` / ${n(config.overs)}` : ''}</span>}
                {!chasing && <span>{m.current === 0 ? t('1st innings', '১ম ইনিংস') : ''}</span>}
              </div>
              <div className="hc-over">
                {over.map((e, i) => <span key={i} className={`ball ${e.out ? 'w' : e.runs >= 6 ? 's' : ''}`}>{e.out ? 'W' : n(e.runs)}</span>)}
              </div>
            </>
          ) : (
            <div className="hc-board-row"><span className="hc-team">{t('Toss', 'টস')}</span><span>{spec.occasion}</span></div>
          )}
        </div>
        {chasing && <div className="hc-chase"><ChaseHud c={{ target: tg!, runs: inn!.runs, wickets: inn!.wickets, maxWickets: config.wickets, balls: inn!.balls, maxBalls: lim.balls, par: v.par, events: inn!.events, name: names[batSide] }} /></div>}
        <div className="hc-arena">
          <div className={`hc-hand left ${reveal === 'shake' ? 'shake' : ''}`}>{v.Reveal({ n: revealN(0), side: 0, cuff: kit[0], label: names[0], shaking: reveal === 'shake' })}</div>
          <div className="hc-vs">
            {flash ? <span className={`hc-flash ${flash.kind}`} data-testid="flash">{flash.text}</span> : <span className="vs">VS</span>}
            {flash?.note && <small className="hc-note">{flash.note}</small>}
          </div>
          <div className={`hc-hand right ${reveal === 'shake' ? 'shake' : ''}`}>{v.Reveal({ n: revealN(1), side: 1, cuff: kit[1], label: names[1], shaking: reveal === 'shake' })}</div>
        </div>
      </div>
      {pad(0)}

      {phase === 'coin' && !paused && <Overlay label={t('Toss', 'টস')}><CoinToss names={names} vsAI={vsAI} onDone={(b) => startMatch(b ? 0 : 1)} /></Overlay>}
      {phase === 'tossCall' && !paused && (
        <Overlay label={t('Toss: odd or even?', 'টস: জোড় না বিজোড়?')}>
          <div className="sheet ruled" data-testid="toss">
            <h2>{t('Toss: odd or even?', 'টস: জোড় না বিজোড়?')}</h2>
            <p className="lede">{t(`${names[0]}, call odd or even. Then both show a number; the sum decides.`, `${names[0]}, জোড় না বিজোড় বলো। তারপর দুজনেই সংখ্যা দেখাবে, যোগফলে ফয়সালা।`)}</p>
            <div className="actions">
              <button className="btn big" onClick={() => { setCall('odd'); setPhase('tossPick'); sfx('click'); }} data-testid="call-odd">{t('Odd', 'বিজোড়')}</button>
              <button className="btn big secondary" onClick={() => { setCall('even'); setPhase('tossPick'); sfx('click'); }}>{t('Even', 'জোড়')}</button>
            </div>
          </div>
        </Overlay>
      )}
      {phase === 'tossPick' && <div className="hc-banner">{t('Now both show a number.', 'এবার দুজনেই একটা সংখ্যা দেখাও।')}</div>}
      {phase === 'tossResult' && tossNums && !paused && (
        <Overlay label={t('Toss result', 'টসের ফল')}>
          <div className="sheet ruled">
            <h2>{t(`${names[tossWin]} won the toss!`, `${names[tossWin]} টস জিতেছে!`)}</h2>
            <p className="lede">{n(tossNums[0])} + {n(tossNums[1])} = {n(tossNums[0] + tossNums[1])} — {(tossNums[0] + tossNums[1]) % 2 ? t('odd', 'বিজোড়') : t('even', 'জোড়')}</p>
            {vsAI && tossWin === 1 ? (
              <>
                <p>{t(`The computer chose to ${aiToss ? 'bat first' : 'bowl first'}.`, `কম্পিউটার ${aiToss ? 'আগে ব্যাট' : 'আগে বল'} নিয়েছে।`)}</p>
                <div className="actions"><button className="btn big" onClick={() => startMatch(aiToss ? 1 : 0)} data-testid="toss-continue" autoFocus>{t('Continue', 'চলো')}</button></div>
              </>
            ) : (
              <div className="actions">
                <button className="btn big" onClick={() => startMatch(tossWin)} data-testid="bat-first">{t('Bat first', 'আগে ব্যাট')}</button>
                <button className="btn big secondary" onClick={() => startMatch(other(tossWin))} data-testid="bowl-first">{t('Bowl first', 'আগে বল')}</button>
              </div>
            )}
          </div>
        </Overlay>
      )}
      {phase === 'break' && m && !paused && (
        <Overlay label={t('Innings break', 'ইনিংস বিরতি')}>
          <div className="sheet ruled">
            <h2>{t('Innings break', 'ইনিংস বিরতি')}</h2>
            <p className="lede">{t(`${names[m.battingFirst]} made ${m.innings[0].runs}/${m.innings[0].wickets}.`, `${names[m.battingFirst]} করেছে ${n(m.innings[0].runs)}/${n(m.innings[0].wickets)}।`)}</p>
            <p className="break-target">{t(`${names[other(m.battingFirst)]} need ${m.innings[0].runs + 1}${lim.balls ? ` from ${lim.balls} balls` : ''}`, `${names[other(m.battingFirst)]}-এর লাগবে ${n(m.innings[0].runs + 1)}${lim.balls ? `, ${n(lim.balls)} বলে` : ''}`)}</p>
            <div className="actions"><button className="btn big" data-testid="second-innings" autoFocus onClick={() => { setPhase('play'); commitAI(m); sfx('bell'); }}>{t('Start the chase', 'তাড়া শুরু করো')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={onRestart} onQuit={onQuit} help={help} />}
    </div>
  );
}
