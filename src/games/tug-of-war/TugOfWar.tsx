import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { useSettings } from '../../platform/settings';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { GameCanvas } from '../../engine/GameCanvas';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { TugAI, type Team } from './model';
import { TugScene, type TugEvent } from './TugScene';
import './tug-of-war.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'rounds' | 'bestOf' | 'input' | 'rhythm' | 'assist' | 'assistHelp'
  | 'pull' | 'perfect' | 'good' | 'slip' | 'heave' | 'chant' | 'red' | 'blue' | 'roundWin' | 'roundDraw' | 'next'
  | 'matchWin' | 'perfects' | 'slips' | 'roundsWon' | 'landscape'
> = {
  en: {
    title: 'Tug of War', lede: 'Sports day. Joba House against Oporajita House. Pull on the beat!',
    r1: 'Tap your pad when the ring closes on the circle: “Heave!”',
    r2: 'A tap on the beat is a strong pull. Four good pulls in a row give a big heave.',
    r3: 'Tapping off the beat, or twice on one beat, makes your team slip.',
    r4: 'Pull the other team’s front puller over the centre line to win the round.',
    rounds: 'Match', bestOf: 'Best of {n}', input: 'Input', rhythm: 'On the beat', assist: 'Simple tapping', assistHelp: 'Tap at your own speed. Taps above 6 per second do not count.',
    pull: 'PULL!', perfect: 'Perfect!', good: 'Good', slip: 'Slipped!', heave: 'HEAVE-HO!', chant: 'Heave!',
    red: 'Joba House (red)', blue: 'Oporajita House (blue)', roundWin: '{name} wins the round!', roundDraw: 'Round drawn', next: 'Next round',
    matchWin: '{name} wins the match!', perfects: 'Perfect pulls — {name}', slips: 'Slips — {name}', roundsWon: 'Rounds',
    landscape: 'Tip: turn the phone sideways.',
  },
  bn: {
    title: 'দড়ি টানাটানি', lede: 'বার্ষিক ক্রীড়া। জবা হাউস বনাম অপরাজিতা হাউস। তালে তালে টানো!',
    r1: 'বৃত্তটা ছোট হয়ে গোল দাগে মিললেই প্যাডে চাপো: “হেঁইয়ো!”',
    r2: 'তালে চাপলে জোরে টান। টানা চারবার ঠিক টানলে বিশাল টান।',
    r3: 'তাল ছাড়া চাপলে বা এক তালে দুইবার চাপলে তোমার দল পিছলে যাবে।',
    r4: 'অন্য দলের প্রথম জনকে মাঝের দাগ পার করাও, রাউন্ড তোমার।',
    rounds: 'ম্যাচ', bestOf: '{n} রাউন্ডের', input: 'খেলার ধরন', rhythm: 'তালে তালে', assist: 'সহজ ট্যাপ', assistHelp: 'নিজের মতো ট্যাপ করো। সেকেন্ডে ৬ বারের বেশি গুনবে না।',
    pull: 'টানো!', perfect: 'নিখুঁত!', good: 'ভালো', slip: 'পিছলে গেল!', heave: 'হেঁইয়ো জোরে!', chant: 'হেঁইয়ো!',
    red: 'জবা হাউস (লাল)', blue: 'অপরাজিতা হাউস (নীল)', roundWin: '{name} রাউন্ড জিতেছে!', roundDraw: 'রাউন্ড ড্র', next: 'পরের রাউন্ড',
    matchWin: '{name} ম্যাচ জিতেছে!', perfects: 'নিখুঁত টান — {name}', slips: 'পিছলেছে — {name}', roundsWon: 'রাউন্ড',
    landscape: 'ফোনটা আড়াআড়ি ধরলে মাঠ বড় দেখাবে।',
  },
};

export default function TugOfWar({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const settings = useSettings();
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [bestOf, setBestOf] = useState(3);
  const [assist, setAssist] = useState(settings.inputAssist);
  const [phase, setPhase] = useState<'setup' | 'play' | 'between' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [wins, setWins] = useState<[number, number]>([0, 0]);
  const [roundNo, setRoundNo] = useState(1);
  const [lastWinner, setLastWinner] = useState<Team | null>(null);
  const [down, setDown] = useState<[boolean, boolean]>([false, false]);
  const [summary, setSummary] = useState<{ perfects: [number, number]; slips: [number, number]; newBest: boolean } | null>(null);
  const winsRef = useRef<[number, number]>([0, 0]);
  const totals = useRef({ perfects: [0, 0] as [number, number], slips: [0, 0] as [number, number], bestRoundPerfects: 0 });
  const rng = useMemo(() => createRng(), []);
  const vsAI = mode === 'ai';
  const names: [string, string] = vsAI ? [`${t('red')} — ${u('you')}`, `${t('blue')} — ${u('computer')}`] : [`${n1} (${t('red')})`, `${n2} (${t('blue')})`];
  const short: [string, string] = vsAI ? [u('you'), u('computer')] : [n1, n2];

  const [scene, setScene] = useState<TugScene | null>(null);
  const newScene = useCallback(() => {
    const sc = new TugScene(assist, vsAI ? new TugAI(1, diff, rng) : null, {
      perfect: t('perfect'), good: t('good'), slip: t('slip'), heave: t('heave'), chant: t('chant'), num: (n) => t.n(n),
    }, settings.reducedMotion);
    setScene(sc);
    sfx('whistle');
    return sc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assist, vsAI, diff, rng, t.lang, settings.reducedMotion]);

  const startMatch = () => {
    setWins([0, 0]);
    winsRef.current = [0, 0];
    setRoundNo(1);
    setSummary(null);
    totals.current = { perfects: [0, 0], slips: [0, 0], bestRoundPerfects: 0 };
    setPaused(false);
    setPhase('play');
    newScene();
  };

  useGameBar({ onPause: phase === 'play' ? () => setPaused(true) : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  // Scene events → sound, haptics, round flow.
  useEffect(() => {
    if (!scene) return;
    scene.onEvent = (e: TugEvent) => {
      if (e.type === 'beat') sfx('thud', { gain: 0.35 });
      if (e.type === 'input') {
        if (e.r.slip) { sfx('bad', { gain: 0.6 }); if (e.team === 0 || !vsAI) vibrate(40); }
        else if (e.r.heave) { sfx('heave', { pitch: 1.2 }); sfx('creak'); }
        else if (e.r.judgement !== 'ignored') sfx('creak', { pitch: e.team === 0 ? 1 : 1.15, gain: 0.7 });
      }
      if (e.type === 'roundOver') {
        const m = scene.model;
        totals.current.perfects[0] += m.perfects[0]; totals.current.perfects[1] += m.perfects[1];
        totals.current.slips[0] += m.slips[0]; totals.current.slips[1] += m.slips[1];
        totals.current.bestRoundPerfects = Math.max(totals.current.bestRoundPerfects, m.perfects[0]);
        sfx('whistle');
        if (e.winner !== null) sfx('clap');
        setLastWinner(e.winner);
        const nw: [number, number] = [winsRef.current[0], winsRef.current[1]];
        if (e.winner !== null) nw[e.winner]++;
        winsRef.current = nw;
        setWins(nw);
        const need = Math.ceil(bestOf / 2);
        window.setTimeout(() => {
          if (nw[0] >= need || nw[1] >= need) finish(nw);
          else setPhase('between');
        }, 2200);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, bestOf, vsAI]);

  const finish = (w: [number, number]) => {
    const outcome = !vsAI ? 'none' : w[0] > w[1] ? 'win' : 'loss';
    const res = recordResult('tug-of-war', { outcome, score: vsAI ? totals.current.perfects[0] : undefined }, (_s, rr) => {
      const ids: string[] = [];
      if (rr.outcome === 'win') ids.push('tw-win');
      if (totals.current.bestRoundPerfects >= 10) ids.push('tw-perfect');
      return ids;
    });
    setSummary({ perfects: [...totals.current.perfects] as [number, number], slips: [...totals.current.slips] as [number, number], newBest: vsAI && res.newBest });
    setPhase('result');
  };

  const press = useCallback((team: Team) => {
    if (!scene || paused || phase !== 'play') return;
    scene.press(team);
    setDown((d) => { const n: [boolean, boolean] = [d[0], d[1]]; n[team] = true; return n; });
  }, [scene, paused, phase]);
  const release = (team: Team) => setDown((d) => { const n: [boolean, boolean] = [d[0], d[1]]; n[team] = false; return n; });

  // Keyboard: P1 = A or Space, P2 = L or Enter. Against the computer, any of them is P1.
  useEffect(() => {
    const teamOf = (code: string): Team | -1 => {
      if (['KeyA', 'Space', 'KeyS'].includes(code)) return 0;
      if (['KeyL', 'Enter', 'KeyK'].includes(code)) return vsAI ? 0 : 1;
      return -1;
    };
    const kd = (e: KeyboardEvent) => { const tm = teamOf(e.code); if (tm < 0 || e.repeat) return; e.preventDefault(); press(tm as Team); };
    const ku = (e: KeyboardEvent) => { const tm = teamOf(e.code); if (tm < 0) return; release(tm as Team); };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [press, vsAI]);

  const onHidden = useCallback(() => { if (phase === 'play') setPaused(true); }, [phase]);

  if (phase === 'setup') {
    return (
      <div className="tw-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <Rules t={t} />
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            {vsAI && <DifficultySeg value={diff} onChange={setDiff} />}
            <div className="opt-label">{t('rounds')}</div>
            <Seg label={t('rounds')} value={bestOf} onChange={setBestOf} options={[1, 3, 5].map((v) => ({ v, label: t('bestOf', { n: v }) }))} />
            <div className="opt-label">{t('input')}</div>
            <Seg label={t('input')} value={assist ? 1 : 0} onChange={(v) => setAssist(v === 1)} options={[{ v: 0, label: t('rhythm') }, { v: 1, label: t('assist') }]} />
            {assist && <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{t('assistHelp')}</p>}
            <div className="actions"><button className="btn big" onClick={startMatch} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const pad = (team: Team) => (
    <button
      className={`touch-pad tw-pad t${team} ${down[team] ? 'down' : ''}`}
      onPointerDown={(e) => { e.preventDefault(); press(team); }}
      onPointerUp={() => release(team)}
      onPointerCancel={() => release(team)}
      onPointerLeave={() => release(team)}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={`pad-${team}`}
      aria-label={`${short[team]} ${t('pull')}`}
    >
      <span>{t('pull')}<br /><small>{short[team]}</small><br /><span className="key-hint hide-touch">{team === 0 ? (vsAI ? 'Space / A' : 'A') : 'L'}</span></span>
    </button>
  );

  return (
    <div className={`tw-root playing ${vsAI ? 'vs-ai' : 'two-p'}`}>
      <div className="tw-score">
        <span className="r">{short[0]} <b>{t.n(wins[0])}</b></span>
        <span className="mid">{t('roundsWon')} {t.n(roundNo)}</span>
        <span className="b"><b>{t.n(wins[1])}</b> {short[1]}</span>
      </div>
      <div className="tw-canvas-wrap">
        {scene && <GameCanvas scene={scene} paused={paused || phase !== 'play'} onHidden={onHidden} label={t('title')} />}
      </div>
      <div className="tw-pads">
        {!vsAI && pad(1)}
        {pad(0)}
      </div>
      <div className="tw-landscape">{t('landscape')}</div>

      {phase === 'between' && (
        <Overlay label={t('next')}>
          <div className="sheet ruled">
            <h2>{lastWinner === null ? t('roundDraw') : t('roundWin', { name: names[lastWinner] })}</h2>
            <p className="lede">{short[0]} {t.n(wins[0])} — {t.n(wins[1])} {short[1]}</p>
            <div className="actions"><button className="btn big" autoFocus data-testid="next-round" onClick={() => { setRoundNo((r) => r + 1); setPhase('play'); newScene(); }}>{t('next')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={startMatch} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && summary && (
        <ReportCard
          outcome={vsAI ? (wins[0] > wins[1] ? 'win' : 'loss') : 'none'}
          title={t('matchWin', { name: names[wins[0] > wins[1] ? 0 : 1] })}
          rows={[
            [t('roundsWon'), `${t.n(wins[0])} — ${t.n(wins[1])}`],
            [t('perfects', { name: short[0] }), summary.perfects[0]],
            [t('perfects', { name: short[1] }), summary.perfects[1]],
            [t('slips', { name: short[0] }), summary.slips[0]],
            [t('slips', { name: short[1] }), summary.slips[1]],
          ]}
          newBest={summary.newBest}
          onAgain={startMatch}
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
