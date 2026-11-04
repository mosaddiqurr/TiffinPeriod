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
import './balloon-burst.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'length' | 'sec' | 'pop' | 'miss' | 'cloud' | 'time' | 'target'
  | 'red' | 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'score' | 'pops' | 'combo' | 'acc' | 'clouds' | 'over' | 'won' | 'draw' | 'aiName'
> = {
  en: {
    title: 'Balloon Burst', lede: 'The balloon seller at the mela. A pin in your hand. Go!',
    r1: 'Tap a balloon to pop it. Fast hits in a row build a combo (×1.5, ×2, ×3).',
    r2: 'The banner calls a colour. That colour gives double points.',
    r3: 'Gold balloons are small and fast: 30 points. Big ringed balloons need two hits.',
    r4: 'Do NOT pop the grey rain cloud. It costs points and soaks your screen.',
    r5: 'Tapping empty sky breaks your combo. Aim before you tap!',
    length: 'Round length', sec: '{n} s', pop: 'Pop!', miss: 'Miss', cloud: 'Rain!', time: 'Time', target: '{c} ×2',
    red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', orange: 'Orange',
    score: 'Score', pops: 'Balloons popped', combo: 'Best combo', acc: 'Accuracy', clouds: 'Rain clouds popped', over: 'Time up!', won: '{name} wins!', draw: 'Draw!',
    aiName: 'Rina',
  },
  bn: {
    title: 'বেলুন ফাটানো', lede: 'মেলায় বেলুনওয়ালা এসেছে। হাতে আলপিন। শুরু!',
    r1: 'বেলুনে ট্যাপ করলেই ফাটবে। পরপর তাড়াতাড়ি ফাটালে কম্বো (×১.৫, ×২, ×৩)।',
    r2: 'ব্যানারে একটা রং ডাকা হবে। সেই রঙের বেলুনে দ্বিগুণ পয়েন্ট।',
    r3: 'সোনালি বেলুন ছোট আর দ্রুত: ৩০ পয়েন্ট। দাগওয়ালা বড় বেলুনে দুইবার লাগবে।',
    r4: 'ধূসর মেঘলা বেলুন ফাটাবে না! পয়েন্ট কাটবে, পর্দায় বৃষ্টি নামবে।',
    r5: 'ফাঁকা আকাশে ট্যাপ করলে কম্বো ভাঙবে। আগে তাক করো!',
    length: 'সময়', sec: '{n} সেকেন্ড', pop: 'ফট!', miss: 'ফসকে গেল', cloud: 'বৃষ্টি!', time: 'সময়', target: '{c} ×২',
    red: 'লাল', yellow: 'হলুদ', green: 'সবুজ', blue: 'নীল', pink: 'গোলাপি', orange: 'কমলা',
    score: 'পয়েন্ট', pops: 'বেলুন ফাটিয়েছ', combo: 'সেরা কম্বো', acc: 'নিশানা', clouds: 'মেঘলা বেলুন', over: 'সময় শেষ!', won: '{name} জিতেছে!', draw: 'সমান সমান!',
    aiName: 'রিনা',
  },
};

export default function BalloonBurst({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [length, setLength] = useState(45);
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
    });
    setScene(sc);
    setFinal(null);
    setPaused(false);
    setPhase('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, diff, length, t.lang, names.join('|')]);

  useGameBar({ onPause: phase === 'play' ? () => setPaused(true) : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  useEffect(() => {
    if (!scene) return;
    scene.onEvent = (e: BalloonEvent) => {
      if (e.type === 'go') sfx('whistle');
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
            <Rules t={t} />
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
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && final && (
        <ReportCard
          outcome={mode === 'ai' ? (winnerIdx === 0 ? 'win' : winnerIdx === 1 ? 'loss' : 'tie') : mode === 'local2p' && winnerIdx === -1 ? 'tie' : 'none'}
          title={mode === 'solo' ? t('over') : winnerIdx === -1 ? t('draw') : t('won', { name: names[winnerIdx] })}
          rows={sc.flatMap((s, i) => {
            const pre = sc.length > 1 ? `${names[i]} — ` : '';
            return [
              [pre + t('score'), s.score],
              [pre + t('pops'), s.pops],
              [pre + t('combo'), s.bestCombo],
              ...(i === 0 || mode === 'local2p' ? [[pre + t('acc'), `${t.n(s.taps ? Math.round((s.pops / s.taps) * 100) : 0)}%`] as [string, string]] : []),
              ...(s.clouds ? [[pre + t('clouds'), s.clouds] as [string, number]] : []),
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

function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4' | 'r5'>> }) {
  return <ol><li>{t('r1')}</li><li>{t('r2')}</li><li>{t('r3')}</li><li><b>{t('r4')}</b></li><li>{t('r5')}</li></ol>;
}
