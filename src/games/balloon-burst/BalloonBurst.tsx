import { useCallback, useEffect, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { GameCanvas } from '../../engine/GameCanvas';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BalloonScene, type BalloonEvent } from './BalloonScene';
import type { BColor, Scorer } from './field';
import { GOLD_BONUS, pelletsFor, type PopStyle } from './gun';
import { readJSON, writeJSON } from '../../platform/storage';
import './balloon-burst.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'length' | 'sec' | 'pop' | 'miss' | 'cloud' | 'time' | 'target'
  | 'red' | 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'score' | 'pops' | 'combo' | 'acc' | 'clouds' | 'over' | 'won' | 'draw' | 'aiName'
  | 'how' | 'pin' | 'gun' | 'pinSub' | 'gunSub' | 'g1' | 'g2' | 'g3' | 'pellets' | 'bonus' | 'empty' | 'hint' | 'shots' | 'outOf'
> = {
  en: {
    title: 'Balloon Burst', lede: 'The balloon stall at the mela. A pin, or the air gun? Go!',
    r1: 'Tap a balloon to pop it. Fast hits in a row build a combo (×1.5, ×2, ×3).',
    r2: 'The banner calls a colour. That colour gives double points.',
    r3: 'Gold balloons are small and fast: 30 points. Big ringed balloons need two hits.',
    r4: 'Do NOT pop the grey rain cloud. It costs points and soaks your screen.',
    r5: 'Tapping empty sky breaks your combo. Aim before you tap!',
    length: 'Round length', sec: '{n} s', pop: 'Pop!', miss: 'Miss', cloud: 'Rain!', time: 'Time', target: '{c} ×2',
    red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', orange: 'Orange',
    score: 'Score', pops: 'Balloons popped', combo: 'Best combo', acc: 'Accuracy', clouds: 'Rain clouds popped', over: 'Time up!', won: '{name} wins!', draw: 'Draw!',
    aiName: 'Rina',
    how: 'How to pop', pin: 'Pin', gun: 'Mela air gun', pinSub: 'Tap a balloon to pop it', gunSub: 'Aim the sight and shoot, like the stall at the fair',
    g1: 'Drag anywhere to move the sight. Let go to shoot. Your finger never hides the balloon.',
    g2: 'The sight sways a little, like a real hand, and the pellet takes a moment to fly: aim a touch above a rising balloon.',
    g3: 'You get {n} pellets for the round. A gold balloon gives {b} more. The round ends when time or pellets run out.',
    pellets: 'Pellets', bonus: '+{b} pellets!', empty: 'Out of pellets', hint: 'Drag to aim · let go to shoot', shots: 'Pellets fired', outOf: 'Out of pellets!',
  },
  bn: {
    title: 'বেলুন ফাটানো', lede: 'মেলায় বেলুনের দোকান। আলপিন নাকি বন্দুক? শুরু!',
    r1: 'বেলুনে ট্যাপ করলেই ফাটবে। পরপর তাড়াতাড়ি ফাটালে কম্বো (×১.৫, ×২, ×৩)।',
    r2: 'ব্যানারে একটা রং ডাকা হবে। সেই রঙের বেলুনে দ্বিগুণ পয়েন্ট।',
    r3: 'সোনালি বেলুন ছোট আর দ্রুত: ৩০ পয়েন্ট। দাগওয়ালা বড় বেলুনে দুইবার লাগবে।',
    r4: 'ধূসর মেঘলা বেলুন ফাটাবে না! পয়েন্ট কাটবে, পর্দায় বৃষ্টি নামবে।',
    r5: 'ফাঁকা আকাশে ট্যাপ করলে কম্বো ভাঙবে। আগে তাক করো!',
    length: 'সময়', sec: '{n} সেকেন্ড', pop: 'ফট!', miss: 'ফসকে গেল', cloud: 'বৃষ্টি!', time: 'সময়', target: '{c} ×২',
    red: 'লাল', yellow: 'হলুদ', green: 'সবুজ', blue: 'নীল', pink: 'গোলাপি', orange: 'কমলা',
    score: 'পয়েন্ট', pops: 'বেলুন ফাটিয়েছ', combo: 'সেরা কম্বো', acc: 'নিশানা', clouds: 'মেঘলা বেলুন', over: 'সময় শেষ!', won: '{name} জিতেছে!', draw: 'সমান সমান!',
    aiName: 'রিনা',
    how: 'কীভাবে ফাটাবে', pin: 'আলপিন', gun: 'মেলার বন্দুক', pinSub: 'বেলুনে ট্যাপ করে ফাটাও', gunSub: 'মেলার দোকানের মতো নিশানা করে গুলি করো',
    g1: 'যেকোনো জায়গায় টেনে নিশানা সরাও। ছেড়ে দিলেই গুলি। আঙুলে বেলুন ঢাকা পড়বে না।',
    g2: 'আসল হাতের মতো নিশানা একটু কাঁপে, আর গুলি পৌঁছাতে একটু সময় লাগে: ওপরে উঠতে থাকা বেলুনের একটু ওপরে তাক করো।',
    g3: 'এই রাউন্ডে {n}টা গুলি। সোনালি বেলুনে আরও {b}টা। সময় বা গুলি ফুরালে রাউন্ড শেষ।',
    pellets: 'গুলি', bonus: '+{b}টা গুলি!', empty: 'গুলি শেষ', hint: 'টেনে নিশানা · ছাড়লে গুলি', shots: 'গুলি ছুড়েছ', outOf: 'গুলি শেষ!',
  },
};

export default function BalloonBurst({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [length, setLength] = useState(45);
  const [style, setStyleState] = useState<PopStyle>(() => (readJSON<string>('bb.style', 'gun') === 'pin' ? 'pin' : 'gun'));
  const setStyle = (s: PopStyle) => { setStyleState(s); writeJSON('bb.style', s); };
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [scene, setScene] = useState<BalloonScene | null>(null);
  const [final, setFinal] = useState<{ scorers: Scorer[]; newBest: boolean } | null>(null);
  const names = mode === 'solo' ? [u('you')] : mode === 'ai' ? [u('you'), t('aiName')] : [n1, n2];

  const start = useCallback(() => {
    const colorName: Record<BColor, string> = { red: t('red'), yellow: t('yellow'), green: t('green'), blue: t('blue'), pink: t('pink'), orange: t('orange') };
    const sc = new BalloonScene(mode, diff, length, {
      pop: t('pop'), miss: t('miss'), cloud: t('cloud'), time: t('time'), colorName, targetFmt: (c) => t('target', { c }),
      num: (n) => t.n(n), players: names,
      pellets: t('pellets'), bonus: t('bonus', { b: GOLD_BONUS }), empty: t('empty'), hint: t('hint'),
    }, style);
    setScene(sc);
    setFinal(null);
    setPaused(false);
    setPhase('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, diff, length, style, t.lang, names.join('|')]);

  useGameBar({ onPause: phase === 'play' ? () => setPaused(true) : undefined, help: <Rules t={t} style={style} length={length} /> }, [phase, t.lang, style, length]);

  // Test hook for the browser tests.
  useEffect(() => {
    if (!scene) return;
    (window as unknown as { __balloon?: BalloonScene }).__balloon = scene;
    return () => { delete (window as unknown as { __balloon?: BalloonScene }).__balloon; };
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    scene.onEvent = (e: BalloonEvent) => {
      if (e.type === 'go') sfx('whistle');
      if (e.type === 'shot') {
        if (e.ok) { sfx('click', { pitch: 1.7, gain: e.human ? 0.9 : 0.35 }); if (e.human) { sfx('whoosh', { gain: 0.25 }); vibrate(12); } }
        else sfx('tick', { gain: 0.6 });
      }
      if (e.type === 'hit') {
        const r = e.r;
        if (r.type === 'pop') { sfx(r.b.kind === 'gold' ? 'popBig' : 'pop', { pitch: 0.85 + Math.random() * 0.3, gain: e.human ? 1 : 0.5 }); if (e.human) vibrate(8); if (r.b.kind === 'gold' && e.human) sfx('good'); }
        if (r.type === 'damage') sfx('boing', { gain: e.human ? 1 : 0.5 });
        if (r.type === 'cloud') { sfx('splash'); if (e.human) vibrate([20, 30, 20]); }
        if (r.type === 'miss' && e.human) sfx('click', { pitch: 0.6 });
      }
      if (e.type === 'over') {
        sfx('whistle');
        const scorers = mode === 'local2p' ? scene.fields.map((f) => f.scorers[0]) : scene.fields[0].scorers;
        const me = scorers[0];
        let outcome: 'win' | 'loss' | 'tie' | 'none' = 'none';
        if (mode === 'ai') outcome = me.score > scorers[1].score ? 'win' : me.score < scorers[1].score ? 'loss' : 'tie';
        const res = recordResult('balloon-burst', { outcome, score: mode === 'solo' ? me.score : undefined, records: { bestCombo: me.bestCombo } }, () => {
          const ids: string[] = [];
          if (scorers.some((s, i) => (mode !== 'ai' || i === 0) && s.bestCombo >= 15)) ids.push('bb-combo15');
          if (scorers.some((s, i) => (mode !== 'ai' || i === 0) && s.score >= 500)) ids.push('bb-500');
          return ids;
        });
        window.setTimeout(() => { setFinal({ scorers: scorers.map((s) => ({ ...s })), newBest: mode === 'solo' && res.newBest }); setPhase('result'); }, 900);
      }
    };
  }, [scene, mode]);

  // Keyboard crosshair for solo and versus the computer.
  useEffect(() => {
    if (!scene || mode === 'local2p') return;
    const step = 38;
    const k = (e: KeyboardEvent) => {
      if (paused) return;
      const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (m[e.key]) { e.preventDefault(); scene.moveCross(...m[e.key]); }
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) scene.fireCross(); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, mode, paused]);

  const onHidden = useCallback(() => { if (phase === 'play') setPaused(true); }, [phase]);

  if (phase === 'setup') {
    return (
      <div className="bb-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <div className="opt-label">{t('how')}</div>
            <div className="bb-style" role="radiogroup" aria-label={t('how')}>
              {(['gun', 'pin'] as PopStyle[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={style === v} className="bb-style-opt" data-testid={`style-${v}`} onClick={() => { if (style !== v) { sfx('click'); setStyle(v); } }}>
                  <StyleArt gun={v === 'gun'} />
                  <span><b>{t(v)}</b><small>{t(v === 'gun' ? 'gunSub' : 'pinSub')}</small></span>
                  {style === v && <i aria-hidden="true">✓</i>}
                </button>
              ))}
            </div>
            <Rules t={t} style={style} length={length} />
            <ModeSeg value={mode} onChange={setMode} modes={['solo', 'ai', 'local2p']} />
            {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
            <div className="opt-label">{t('length')}</div>
            <Seg label={t('length')} value={length} onChange={setLength} options={[30, 45, 60].map((v) => ({ v, label: t('sec', { n: v }) }))} />
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const sc = final?.scorers ?? [];
  const winnerIdx = sc.length > 1 ? (sc[0].score === sc[1].score ? -1 : sc[0].score > sc[1].score ? 0 : 1) : 0;

  return (
    <div className="bb-root playing">
      {scene && <GameCanvas scene={scene} paused={paused || phase !== 'play'} onHidden={onHidden} label={t('title')} />}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={<Rules t={t} style={style} length={length} />} />}
      {phase === 'result' && final && (
        <ReportCard
          outcome={mode === 'ai' ? (winnerIdx === 0 ? 'win' : winnerIdx === 1 ? 'loss' : 'tie') : mode === 'local2p' && winnerIdx === -1 ? 'tie' : 'none'}
          title={mode === 'solo' ? (style === 'gun' && scene?.lanes[0]?.gun?.empty ? t('outOf') : t('over')) : winnerIdx === -1 ? t('draw') : t('won', { name: names[winnerIdx] })}
          rows={sc.flatMap((s, i) => {
            const pre = sc.length > 1 ? `${names[i]} — ` : '';
            return [
              [pre + t('score'), s.score],
              [pre + t('pops'), s.pops],
              [pre + t('combo'), s.bestCombo],
              ...(i === 0 || mode === 'local2p' ? [[pre + t('acc'), `${t.n(s.taps ? Math.round((s.pops / s.taps) * 100) : 0)}%`] as [string, string]] : []),
              ...(s.clouds ? [[pre + t('clouds'), s.clouds] as [string, number]] : []),
              ...(style === 'gun' && (i === 0 || mode === 'local2p') ? [[pre + t('shots'), s.taps] as [string, number]] : []),
            ] as Array<[string, string | number]>;
          })}
          newBest={final.newBest}
          onAgain={start}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      )}
    </div>
  );
}

function Rules({ t, style = 'pin', length = 45 }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'g1' | 'g2' | 'g3'>>; style?: PopStyle; length?: number }) {
  if (style === 'gun') return <ol><li>{t('g1')}</li><li>{t('g2')}</li><li>{t('g3', { n: pelletsFor(length), b: GOLD_BONUS })}</li><li>{t('r2')}</li><li><b>{t('r4')}</b></li></ol>;
  return <ol><li>{t('r1')}</li><li>{t('r2')}</li><li>{t('r3')}</li><li><b>{t('r4')}</b></li><li>{t('r5')}</li></ol>;
}

/** Little pictures for the two ways to pop: a pin, or the stall's air gun. */
function StyleArt({ gun }: { gun: boolean }) {
  return (
    <svg viewBox="0 0 64 48" className="bb-style-svg" aria-hidden="true">
      <rect x="1" y="1" width="62" height="46" rx="6" fill="#bfe6f7" />
      <ellipse cx="22" cy="17" rx="8" ry="9.5" fill="#e5383b" /><ellipse cx="42" cy="13" rx="7" ry="8.5" fill="#ffd23f" /><ellipse cx="48" cy="28" rx="6" ry="7" fill="#3a86ff" />
      <path d="M22 27 q2 4 0 8 M42 22 q-2 4 0 7" stroke="#7a5a3a" strokeWidth="1" fill="none" />
      {gun ? <>
        <rect x="0" y="39" width="64" height="8" fill="#8a5428" />
        <g transform="rotate(-38 32 47)"><rect x="16" y="43" width="14" height="7" rx="2" fill="#a8693a" /><rect x="29" y="44" width="10" height="5" fill="#2e3238" /><rect x="38" y="45" width="18" height="3" fill="#59616b" /></g>
        <circle cx="22" cy="17" r="6" fill="none" stroke="#c62f2f" strokeWidth="1.6" /><path d="M22 8 v4 M22 22 v4 M13 17 h4 M27 17 h4" stroke="#c62f2f" strokeWidth="1.6" />
      </> : <>
        <path d="M30 34 L40 24" stroke="#8a8f96" strokeWidth="2.4" strokeLinecap="round" /><circle cx="29" cy="35" r="3.6" fill="#7d3c98" />
      </>}
    </svg>
  );
}
